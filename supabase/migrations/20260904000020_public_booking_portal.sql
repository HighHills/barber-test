-- 20260904000020_public_booking_portal.sql
-- Public Customer Self-Booking Portal & Instant WhatsApp Ticket Notification
-- Security Definer RPCs for unauthenticated (anon) and authenticated booking access
-- Protected by PostgreSQL btree_gist exclusion constraint on appointments table

-- 1. Helper function to get public active outlets
CREATE OR REPLACE FUNCTION get_public_booking_outlets()
RETURNS TABLE (
  id UUID,
  code VARCHAR,
  name VARCHAR,
  address TEXT,
  phone VARCHAR,
  email VARCHAR,
  timezone VARCHAR,
  operating_hours VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.code,
    o.name,
    o.address,
    o.phone,
    o.email,
    o.timezone,
    '09:00 - 21:00'::VARCHAR AS operating_hours
  FROM outlets o
  WHERE o.is_active = TRUE
  ORDER BY o.name ASC;
END;
$$;

-- 2. Helper function to get services available at an outlet
CREATE OR REPLACE FUNCTION get_public_booking_services(p_outlet_id UUID)
RETURNS TABLE (
  id UUID,
  code VARCHAR,
  name VARCHAR,
  description TEXT,
  category_name VARCHAR,
  duration_minutes INT,
  selling_price NUMERIC(18,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.code,
    s.name,
    s.description,
    COALESCE(sc.name, 'Layanan Utama')::VARCHAR AS category_name,
    s.duration_minutes,
    so.selling_price
  FROM services s
  JOIN service_outlets so ON so.service_id = s.id
  LEFT JOIN service_categories sc ON sc.id = s.category_id
  WHERE so.outlet_id = p_outlet_id
    AND so.is_active = TRUE
    AND s.is_active = TRUE
  ORDER BY sc.sort_order ASC, s.name ASC;
END;
$$;

-- 3. Helper function to get active barbers for an outlet
CREATE OR REPLACE FUNCTION get_public_booking_barbers(p_outlet_id UUID)
RETURNS TABLE (
  id UUID,
  employee_code VARCHAR,
  full_name VARCHAR,
  barber_position VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.employee_code,
    e.full_name,
    e.position::VARCHAR AS barber_position
  FROM employees e
  WHERE e.is_active = TRUE
    AND (
      EXISTS (
        SELECT 1 FROM employee_outlets eo
        WHERE eo.employee_id = e.id AND eo.outlet_id = p_outlet_id AND eo.is_active = TRUE
      )
      OR NOT EXISTS (
        SELECT 1 FROM employee_outlets eo WHERE eo.employee_id = e.id
      )
    )
  ORDER BY e.full_name ASC;
END;
$$;

-- 4. Calculate slot availability for a given date, outlet, barber, and service
CREATE OR REPLACE FUNCTION get_public_booking_slots(
  p_outlet_id UUID,
  p_date DATE,
  p_barber_id UUID DEFAULT NULL,
  p_service_id UUID DEFAULT NULL
)
RETURNS TABLE (
  time_slot VARCHAR,
  is_available BOOLEAN,
  available_barbers_count INT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_duration INT := 45;
  v_timezone VARCHAR := 'Asia/Jakarta';
  v_slot RECORD;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_free_barbers INT;
  v_barber_free BOOLEAN;
  v_total_outlet_barbers INT;
BEGIN
  -- Get outlet timezone
  SELECT COALESCE(timezone, 'Asia/Jakarta') INTO v_timezone
  FROM outlets WHERE id = p_outlet_id;
  IF v_timezone IS NULL THEN v_timezone := 'Asia/Jakarta'; END IF;

  -- Get service duration
  IF p_service_id IS NOT NULL THEN
    SELECT COALESCE(duration_minutes, 45) INTO v_duration
    FROM services WHERE id = p_service_id;
  END IF;

  -- Total active barbers in this outlet
  SELECT COUNT(*)::INT INTO v_total_outlet_barbers
  FROM employees e
  WHERE e.is_active = TRUE
    AND (
      EXISTS (
        SELECT 1 FROM employee_outlets eo
        WHERE eo.employee_id = e.id AND eo.outlet_id = p_outlet_id AND eo.is_active = TRUE
      )
      OR NOT EXISTS (
        SELECT 1 FROM employee_outlets eo WHERE eo.employee_id = e.id
      )
    );

  v_now := CURRENT_TIMESTAMP;

  -- Generate 30-minute intervals from 09:00 to 20:30
  FOR v_slot IN (
    SELECT to_char(t, 'HH24:MI') AS slot_str, t::TIME AS slot_time
    FROM generate_series(
      '2000-01-01 09:00:00'::timestamp,
      '2000-01-01 20:30:00'::timestamp,
      '30 minutes'::interval
    ) t
  ) LOOP
    time_slot := v_slot.slot_str;
    
    -- Combine date & slot time to timestamptz in outlet timezone
    v_slot_start := (p_date::TEXT || ' ' || v_slot.slot_str || ':00')::TIMESTAMP AT TIME ZONE v_timezone;
    v_slot_end := v_slot_start + (v_duration || ' minutes')::INTERVAL;

    -- Check if slot is already in the past
    IF v_slot_start <= (v_now + INTERVAL '10 minutes') THEN
      is_available := FALSE;
      available_barbers_count := 0;
      reason := 'Waktu sudah lewat';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- If specific barber requested
    IF p_barber_id IS NOT NULL THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.barber_id = p_barber_id
          AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
          AND tstzrange(a.start_at, a.end_at) && tstzrange(v_slot_start, v_slot_end)
      ) INTO v_barber_free;

      IF v_barber_free THEN
        is_available := TRUE;
        available_barbers_count := 1;
        reason := 'Tersedia';
      ELSE
        is_available := FALSE;
        available_barbers_count := 0;
        reason := 'Barber sudah ada jadwal';
      END IF;
      RETURN NEXT;
    ELSE
      -- "Bebas / Siapa Saja": Count how many barbers are free
      SELECT COUNT(*)::INT INTO v_free_barbers
      FROM employees e
      WHERE e.is_active = TRUE
        AND (
          EXISTS (
            SELECT 1 FROM employee_outlets eo
            WHERE eo.employee_id = e.id AND eo.outlet_id = p_outlet_id AND eo.is_active = TRUE
          )
          OR NOT EXISTS (
            SELECT 1 FROM employee_outlets eo WHERE eo.employee_id = e.id
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.barber_id = e.id
            AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
            AND tstzrange(a.start_at, a.end_at) && tstzrange(v_slot_start, v_slot_end)
        );

      available_barbers_count := v_free_barbers;
      IF v_free_barbers > 0 THEN
        is_available := TRUE;
        reason := 'Tersedia (' || v_free_barbers || ' barber)';
      ELSE
        is_available := FALSE;
        reason := 'Semua barber penuh';
      END IF;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- 5. Main Booking Creation RPC (Atomic & Safe)
CREATE OR REPLACE FUNCTION create_public_booking(
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
  SELECT id, name, address, phone, COALESCE(timezone, 'Asia/Jakarta') AS timezone INTO v_outlet
  FROM outlets
  WHERE id = p_outlet_id AND is_active = TRUE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cabang barbershop tidak ditemukan atau sedang tidak aktif.';
  END IF;
  v_timezone := v_outlet.timezone;

  -- 2. Validate Service & Pricing
  SELECT s.id, s.name, s.duration_minutes, so.selling_price
  INTO v_service
  FROM services s
  JOIN service_outlets so ON so.service_id = s.id
  WHERE s.id = p_service_id
    AND so.outlet_id = p_outlet_id
    AND s.is_active = TRUE
    AND so.is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Layanan yang dipilih tidak tersedia di cabang ini.';
  END IF;

  v_duration := v_service.duration_minutes;
  v_price := v_service.selling_price;

  -- 3. Calculate timestamps in outlet timezone
  v_start_at := (p_booking_date::TEXT || ' ' || to_char(p_booking_time, 'HH24:MI:SS'))::TIMESTAMP AT TIME ZONE v_timezone;
  v_end_at := v_start_at + (v_duration || ' minutes')::INTERVAL;

  IF v_start_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Waktu janji temu tidak boleh di masa lampau. Silakan pilih jadwal yang akan datang.';
  END IF;

  -- 4. Determine Barber
  IF p_barber_id IS NOT NULL THEN
    SELECT id, full_name INTO v_barber_id, v_barber_name
    FROM employees
    WHERE id = p_barber_id AND is_active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Barber yang dipilih tidak ditemukan atau sedang tidak aktif.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM appointments
      WHERE barber_id = v_barber_id
        AND status NOT IN ('CANCELLED', 'NO_SHOW')
        AND tstzrange(start_at, end_at) && tstzrange(v_start_at, v_end_at)
    ) THEN
      RAISE EXCEPTION 'Barber % sudah memiliki jadwal pada jam ini. Silakan pilih jam atau barber lain.', v_barber_name;
    END IF;
  ELSE
    -- Auto-assign first available barber for this outlet
    SELECT e.id, e.full_name INTO v_barber_id, v_barber_name
    FROM employees e
    WHERE e.is_active = TRUE
      AND (
        EXISTS (
          SELECT 1 FROM employee_outlets eo
          WHERE eo.employee_id = e.id AND eo.outlet_id = p_outlet_id AND eo.is_active = TRUE
        )
        OR NOT EXISTS (
          SELECT 1 FROM employee_outlets eo WHERE eo.employee_id = e.id
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM appointments a
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

  -- 5. Customer Resolution
  v_clean_phone := regexp_replace(p_customer_phone, '[^0-9]', '', 'g');
  IF length(v_clean_phone) < 8 THEN
    RAISE EXCEPTION 'Nomor WhatsApp / HP tidak valid (minimal 8 digit).';
  END IF;

  SELECT id INTO v_customer_id
  FROM customers
  WHERE phone = v_clean_phone OR phone = p_customer_phone
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (
      customer_code,
      full_name,
      phone,
      email,
      is_active
    ) VALUES (
      'CUST-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6)),
      trim(p_customer_name),
      v_clean_phone,
      nullif(trim(p_customer_email), ''),
      TRUE
    )
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE customers
    SET full_name = COALESCE(NULLIF(trim(p_customer_name), ''), full_name),
        email = COALESCE(NULLIF(trim(p_customer_email), ''), email),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_customer_id;
  END IF;

  -- 6. Generate Appointment Number & Insert
  v_apt_number := 'APT-' || to_char(p_booking_date, 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

  BEGIN
    INSERT INTO appointments (
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

  -- 7. If appointment is for TODAY, auto-enroll into queues
  v_today_date := (CURRENT_TIMESTAMP AT TIME ZONE v_timezone)::DATE;
  IF p_booking_date = v_today_date THEN
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_next_queue_num
    FROM queues
    WHERE outlet_id = p_outlet_id
      AND joined_at >= (v_today_date::TEXT || ' 00:00:00')::TIMESTAMPTZ;

    INSERT INTO queues (
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
  SELECT COALESCE(business_name, 'Barbershop') INTO v_business_name
  FROM business_settings
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
    '⏰ *Waktu:* ' || to_char(p_booking_time, 'HH24:MI') || ' - ' || to_char((p_booking_time + (v_duration || ' minutes')::interval), 'HH24:MI') || ' WIB' || chr(10) ||
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

-- 6. Grants for public anonymous and authenticated access
GRANT EXECUTE ON FUNCTION get_public_booking_outlets() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_booking_services(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_booking_barbers(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_booking_slots(UUID, DATE, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_public_booking(UUID, UUID, DATE, TIME, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT) TO anon, authenticated;
