-- 20260926050000_defer_public_booking_customer_materialization_until_checkin.sql
-- Public online bookings remain guest appointments until the customer actually checks in.
-- Customer master data is materialized only at check-in.

ALTER TABLE public.appointments
  ALTER COLUMN customer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_customer_name VARCHAR,
  ADD COLUMN IF NOT EXISTS guest_customer_phone VARCHAR,
  ADD COLUMN IF NOT EXISTS guest_customer_email VARCHAR;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.appointments'::regclass
      AND conname = 'appointments_customer_identity_check'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_customer_identity_check
      CHECK (
        customer_id IS NOT NULL
        OR (
          NULLIF(BTRIM(guest_customer_name), '') IS NOT NULL
          AND NULLIF(BTRIM(guest_customer_phone), '') IS NOT NULL
        )
      );
  END IF;
END;
$$;

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
  v_customer_name VARCHAR;
  v_customer_email VARCHAR;
BEGIN
  v_customer_name := BTRIM(p_customer_name);
  v_clean_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_customer_email := NULLIF(BTRIM(COALESCE(p_customer_email, '')), '');

  IF length(v_customer_name) < 2 OR length(v_customer_name) > 40 THEN
    RAISE EXCEPTION 'Nama pelanggan harus 2-40 karakter.';
  END IF;

  IF length(v_clean_phone) < 8 OR length(v_clean_phone) > 20 THEN
    RAISE EXCEPTION 'Nomor WhatsApp / HP tidak valid.';
  END IF;

  IF v_customer_email IS NOT NULL
     AND (
       length(v_customer_email) > 100
       OR v_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     )
  THEN
    RAISE EXCEPTION 'Format email tidak valid.';
  END IF;

  IF p_notes IS NOT NULL AND length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Catatan pelanggan terlalu panjang.';
  END IF;

  SELECT id, name, address, phone, COALESCE(timezone, 'Asia/Jakarta') AS timezone
    INTO v_outlet
    FROM public.outlets
   WHERE id = p_outlet_id
     AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cabang barbershop tidak ditemukan atau sedang tidak aktif.';
  END IF;

  v_timezone := v_outlet.timezone;

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

  v_start_at := (
    p_booking_date::TEXT || ' ' || to_char(p_booking_time, 'HH24:MI:SS')
  )::TIMESTAMP AT TIME ZONE v_timezone;
  v_end_at := v_start_at + (v_duration || ' minutes')::INTERVAL;

  IF v_start_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Waktu janji temu tidak boleh di masa lampau. Silakan pilih jadwal yang akan datang.';
  END IF;

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
      JOIN public.employee_outlets eo
        ON eo.employee_id = e.id
       AND eo.outlet_id = p_outlet_id
       AND eo.is_active = TRUE
     WHERE e.is_active = TRUE
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'public-customer-phone:' || v_clean_phone,
      0
    )
  );

  PERFORM public._check_public_booking_phone_rate_limit(v_clean_phone);

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
      created_by,
      guest_customer_name,
      guest_customer_phone,
      guest_customer_email
    ) VALUES (
      v_apt_number,
      NULL,
      p_outlet_id,
      p_service_id,
      v_barber_id,
      v_start_at,
      v_end_at,
      'CONFIRMED',
      NULLIF(BTRIM(p_notes), ''),
      NULL,
      v_customer_name,
      v_clean_phone,
      v_customer_email
    )
    RETURNING id INTO v_apt_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Tabrakan jadwal: Slot waktu ini baru saja dipesan oleh pelanggan lain. Silakan pilih jam atau barber lain.';
  END;

  PERFORM public._record_public_booking_phone_success(v_clean_phone);

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
      NULL,
      v_apt_id,
      v_barber_id,
      'WAITING',
      v_start_at
    )
    RETURNING id INTO v_queue_id;
  END IF;

  SELECT COALESCE(business_name, 'Barbershop')
    INTO v_business_name
    FROM public.business_settings
   LIMIT 1;

  v_business_name := COALESCE(v_business_name, 'Barbershop');

  v_wa_message := '💈 *TIKET BOOKING RESMI - ' || upper(v_business_name) || '* 💈' || chr(10) ||
    '-----------------------------------------' || chr(10) ||
    '✅ *Status:* Terkonfirmasi (CONFIRMED)' || chr(10) ||
    '🔖 *No. Booking:* ' || v_apt_number || chr(10) || chr(10) ||
    '👤 *Nama Pelanggan:* ' || v_customer_name || chr(10) ||
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
    '💵 *Estimasi Biaya:* Rp ' || to_char(v_price, 'FM999,999,999') || ' (Bayar di Kasir)' || chr(10) ||
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
    'customer_name', v_customer_name,
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

REVOKE ALL ON FUNCTION public.create_public_booking(
  UUID, UUID, DATE, TIME, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(
  UUID, UUID, DATE, TIME, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT
) TO anon, authenticated, service_role;
