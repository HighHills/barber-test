-- 20260907000031_public_booking_phone_rate_limit.sql
-- Defense-in-depth abuse protection for direct anonymous public booking RPC.
--
-- The web client calls Supabase RPCs directly, so this guard lives in the
-- database. It intentionally keys on the normalized phone number because
-- PostgreSQL does not reliably expose the original client IP to a function.
--
-- Policy:
--   * Minimum 15 minutes between successful bookings for the same phone.
--   * Maximum 3 successful bookings in a rolling 24-hour window per phone.
--
-- The counters are updated only after the appointment insert succeeds. Any
-- later exception rolls the entire transaction back, including the counter.

-- ============================================================================
-- 1. RATE-LIMIT STATE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.public_booking_phone_limits (
  phone VARCHAR(64) PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  last_booking_at TIMESTAMPTZ NOT NULL,
  booking_count INTEGER NOT NULL CHECK (booking_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

REVOKE ALL ON TABLE public.public_booking_phone_limits
FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 2. INTERNAL RATE-LIMIT HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public._check_public_booking_phone_rate_limit(
  p_phone VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit RECORD;
BEGIN
  SELECT *
    INTO v_limit
    FROM public.public_booking_phone_limits
   WHERE phone = p_phone
   FOR UPDATE;

  IF FOUND THEN
    IF v_limit.last_booking_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN
      RAISE EXCEPTION
        'Terlalu banyak booking dalam waktu singkat. Silakan coba lagi beberapa menit lagi.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_limit.window_started_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
       AND v_limit.booking_count >= 3 THEN
      RAISE EXCEPTION
        'Batas booking untuk nomor ini telah tercapai. Silakan coba lagi setelah 24 jam dari booking pertama dalam periode ini.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._record_public_booking_phone_success(
  p_phone VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit RECORD;
BEGIN
  SELECT *
    INTO v_limit
    FROM public.public_booking_phone_limits
   WHERE phone = p_phone
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.public_booking_phone_limits (
      phone,
      window_started_at,
      last_booking_at,
      booking_count
    ) VALUES (
      p_phone,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      1
    );
    RETURN;
  END IF;

  IF v_limit.window_started_at <= CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN
    UPDATE public.public_booking_phone_limits
       SET window_started_at = CURRENT_TIMESTAMP,
           last_booking_at = CURRENT_TIMESTAMP,
           booking_count = 1,
           updated_at = CURRENT_TIMESTAMP
     WHERE phone = p_phone;
  ELSE
    UPDATE public.public_booking_phone_limits
       SET last_booking_at = CURRENT_TIMESTAMP,
           booking_count = booking_count + 1,
           updated_at = CURRENT_TIMESTAMP
     WHERE phone = p_phone;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._check_public_booking_phone_rate_limit(VARCHAR)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._record_public_booking_phone_success(VARCHAR)
FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 3. HARDEN THE INTERNAL PUBLIC-BOOKING IMPLEMENTATION
-- ============================================================================
-- Keep the existing public wrapper unchanged. Replace only the internal body
-- so the abuse guard is enforced for every successful anonymous booking.
CREATE OR REPLACE FUNCTION public._legacy_create_public_booking(
  p_outlet_id UUID,
  p_service_id UUID,
  p_booking_date DATE,
  p_booking_time TIME,
  p_customer_name VARCHAR,
  p_customer_phone VARCHAR,
  p_barber_id UUID DEFAULT NULL,
  p_customer_email VARCHAR DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_outlet RECORD;
  v_service RECORD;
  v_barber_id UUID;
  v_barber_name VARCHAR;
  v_customer_id UUID;
  v_duration INT;
  v_price NUMERIC(18,2);
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_apt_id UUID;
  v_apt_number VARCHAR;
  v_clean_phone VARCHAR;
  v_business_name VARCHAR;
  v_wa_message TEXT;
  v_today_date DATE;
  v_next_queue_num INT;
  v_queue_id UUID;
  v_timezone VARCHAR;
BEGIN
  -- 1. Validate Outlet
  SELECT id, name, address, phone, COALESCE(timezone, 'Asia/Jakarta') AS timezone
    INTO v_outlet
    FROM public.outlets
   WHERE id = p_outlet_id
     AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cabang barbershop tidak ditemukan atau sedang tidak aktif.';
  END IF;

  v_timezone := v_outlet.timezone;

  -- 2. Validate Service & Pricing
  SELECT s.id, s.name, s.duration_minutes, so.selling_price
    INTO v_service
    FROM public.services s
    JOIN public.service_outlets so
      ON so.service_id = s.id
     AND so.outlet_id = p_outlet_id
   WHERE s.id = p_service_id
     AND s.is_active = TRUE
     AND so.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Layanan yang dipilih tidak tersedia di cabang ini.';
  END IF;

  v_duration := v_service.duration_minutes;
  v_price := v_service.selling_price;

  -- 3. Calculate timestamps in outlet timezone
  v_start_at := (
    p_booking_date::TEXT || ' ' || to_char(p_booking_time, 'HH24:MI:SS')
  )::TIMESTAMP AT TIME ZONE v_timezone;
  v_end_at := v_start_at + (v_duration || ' minutes')::INTERVAL;

  IF v_start_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Waktu janji temu tidak boleh di masa lampau. Silakan pilih jadwal yang akan datang.';
  END IF;

  -- 4. Determine Barber
  IF p_barber_id IS NOT NULL THEN
    SELECT e.id, e.full_name
      INTO v_barber_id, v_barber_name
      FROM public.employees e
      JOIN public.employee_outlets eo
        ON eo.employee_id = e.id
       AND eo.outlet_id = p_outlet_id
       AND eo.is_active = TRUE
     WHERE e.id = p_barber_id
       AND e.is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barber yang dipilih tidak ditemukan, tidak aktif, atau tidak ditugaskan pada cabang ini.';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.appointments
       WHERE barber_id = v_barber_id
         AND status NOT IN ('CANCELLED', 'NO_SHOW')
         AND tstzrange(start_at, end_at) && tstzrange(v_start_at, v_end_at)
    ) THEN
      RAISE EXCEPTION 'Barber % sudah memiliki jadwal pada jam ini. Silakan pilih jam atau barber lain.', v_barber_name;
    END IF;
  ELSE
    SELECT e.id, e.full_name
      INTO v_barber_id, v_barber_name
      FROM public.employees e
     WHERE e.is_active = TRUE
       AND (
         EXISTS (
           SELECT 1
             FROM public.employee_outlets eo
            WHERE eo.employee_id = e.id
              AND eo.outlet_id = p_outlet_id
              AND eo.is_active = TRUE
         )
         OR NOT EXISTS (
           SELECT 1
             FROM public.employee_outlets eo
            WHERE eo.employee_id = e.id
         )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.appointments a
          WHERE a.barber_id = e.id
            AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
            AND tstzrange(a.start_at, a.end_at) && tstzrange(v_start_at, v_end_at)
       )
     ORDER BY random()
     LIMIT 1;

    IF v_barber_id IS NULL THEN
      RAISE EXCEPTION 'Mohon maaf, semua barber sedang penuh pada jam tersebut. Silakan pilih jam lain.';
    END IF;
  END IF;

  -- 5. Normalize phone and enforce per-phone abuse limits.
  v_clean_phone := regexp_replace(p_customer_phone, '[^0-9]', '', 'g');

  IF length(v_clean_phone) < 8 THEN
    RAISE EXCEPTION 'Nomor WhatsApp / HP tidak valid (minimal 8 digit).';
  END IF;

  -- Serialize resolution and rate-limit decisions for this phone.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'public-customer-phone:' || v_clean_phone,
      0
    )
  );

  PERFORM public._check_public_booking_phone_rate_limit(v_clean_phone);

  SELECT id
    INTO v_customer_id
    FROM public.customers
   WHERE phone = v_clean_phone
      OR phone = p_customer_phone
   LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      customer_code,
      full_name,
      phone,
      email,
      is_active
    ) VALUES (
      'CUST-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' ||
      upper(substr(md5(random()::text), 1, 6)),
      trim(p_customer_name),
      v_clean_phone,
      nullif(trim(p_customer_email), ''),
      TRUE
    )
    RETURNING id INTO v_customer_id;
  END IF;

  -- 6. Generate Appointment Number & Insert
  v_apt_number := 'APT-' || to_char(p_booking_date, 'YYYYMMDD') || '-' ||
                  upper(substr(md5(random()::text), 1, 6));

  BEGIN
    INSERT INTO public.appointments (
      appointment_number,
      customer_id,
      outlet_id,
      service_id,
      barber_id,
      start_at,
      end_at,
      status,
      notes,
      created_by
    ) VALUES (
      v_apt_number,
      v_customer_id,
      p_outlet_id,
      p_service_id,
      v_barber_id,
      v_start_at,
      v_end_at,
      'CONFIRMED',
      nullif(trim(p_notes), ''),
      NULL
    )
    RETURNING id INTO v_apt_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Tabrakan jadwal: Slot waktu ini baru saja dipesan oleh pelanggan lain. Silakan pilih jam atau barber lain.';
  END;

  -- Record the successful booking only after the appointment exists.
  PERFORM public._record_public_booking_phone_success(v_clean_phone);

  -- 7. If appointment is for TODAY, auto-enroll into queues
  v_today_date := (CURRENT_TIMESTAMP AT TIME ZONE v_timezone)::DATE;
  IF p_booking_date = v_today_date THEN
    SELECT COALESCE(MAX(queue_number), 0) + 1
      INTO v_next_queue_num
      FROM public.queues
     WHERE outlet_id = p_outlet_id
       AND joined_at >= (v_today_date::TEXT || ' 00:00:00')::TIMESTAMPTZ;

    INSERT INTO public.queues (
      queue_number,
      outlet_id,
      customer_id,
      appointment_id,
      barber_id,
      status,
      joined_at
    ) VALUES (
      v_next_queue_num,
      p_outlet_id,
      v_customer_id,
      v_apt_id,
      v_barber_id,
      'WAITING',
      v_start_at
    )
    RETURNING id INTO v_queue_id;
  END IF;

  -- 8. Business Info
  SELECT COALESCE(business_name, 'Barbershop')
    INTO v_business_name
    FROM public.business_settings
   LIMIT 1;

  IF v_business_name IS NULL THEN
    v_business_name := 'Barbershop';
  END IF;

  -- 9. Compose formatted WhatsApp confirmation ticket message
  v_wa_message := '💈 *TIKET BOOKING RESMI - ' || upper(v_business_name) || '* 💈' || chr(10) ||
    '-----------------------------------------' || chr(10) ||
    '✅ *Status:* Terkonfirmasi (CONFIRMED)' || chr(10) ||
    '🔖 *No. Booking:* ' || v_apt_number || chr(10) || chr(10) ||
    '👤 *Nama Pelanggan:* ' || trim(p_customer_name) || chr(10) ||
    '📱 *No. WhatsApp:* ' || v_clean_phone || chr(10) ||
    '📍 *Cabang:* ' || v_outlet.name || chr(10) ||
    '🏢 *Alamat:* ' || COALESCE(v_outlet.address, '-') || chr(10) ||
    '📞 *Kontak Cabang:* ' || COALESCE(v_outlet.phone, '-') || chr(10) || chr(10) ||
    '✂️ *Layanan:* ' || v_service.name || chr(10) ||
    '⏱️ *Durasi:* ' || v_duration || ' Menit' || chr(10) ||
    '💈 *Barber / Stylist:* ' || v_barber_name || chr(10) || chr(10) ||
    '📅 *Tanggal:* ' || to_char(p_booking_date, 'DD/MM/YYYY') || chr(10) ||
    '⏰ *Waktu:* ' || to_char(p_booking_time, 'HH24:MI') || ' - ' ||
      to_char((p_booking_time + (v_duration || ' minutes')::interval), 'HH24:MI') || ' WIB' || chr(10) ||
    '💵 *Estimasi Biaya:* Rp ' || to_char(v_price, 'FM999,999,999') ||
      ' (Bayar di Kasir)' || chr(10) ||
    '-----------------------------------------' || chr(10) ||
    '📌 *Petunjuk Kedatangan:*' || chr(10) ||
    '1. Harap tiba 10 menit sebelum jam janji temu Anda.' || chr(10) ||
    '2. Tunjukkan pesan/tiket ini kepada kasir/barber saat tiba.' || chr(10) ||
    '3. Janji temu otomatis dibatalkan jika terlambat lebih dari 15 menit.' || chr(10) || chr(10) ||
    '_Terima kasih atas reservasi Anda! Sampai jumpa di Barbershop!_';

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_apt_id,
    'appointment_number', v_apt_number,
    'customer_name', trim(p_customer_name),
    'customer_phone', v_clean_phone,
    'outlet_id', p_outlet_id,
    'outlet_name', v_outlet.name,
    'outlet_address', v_outlet.address,
    'outlet_phone', v_outlet.phone,
    'service_id', p_service_id,
    'service_name', v_service.name,
    'duration_minutes', v_duration,
    'price', v_price,
    'barber_id', v_barber_id,
    'barber_name', v_barber_name,
    'booking_date', p_booking_date,
    'booking_time', to_char(p_booking_time, 'HH24:MI'),
    'start_at', v_start_at,
    'end_at', v_end_at,
    'queue_number', v_next_queue_num,
    'whatsapp_message', v_wa_message
  );
END;
$$;

REVOKE ALL ON FUNCTION public._legacy_create_public_booking(
  UUID, UUID, DATE, TIME, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 4. ASSERTIONS
-- ============================================================================
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public._legacy_create_public_booking(UUID,UUID,DATE,TIME,VARCHAR,VARCHAR,UUID,VARCHAR,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute internal legacy public booking implementation';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_public_booking(UUID,UUID,DATE,TIME,VARCHAR,VARCHAR,UUID,VARCHAR,TEXT)',
    'EXECUTE'
  ) = FALSE THEN
    RAISE EXCEPTION 'Security assertion failed: anon cannot execute public booking wrapper';
  END IF;
END;
$$;
