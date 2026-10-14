-- Booking conflicts remain visible after leave approval; contact is always manual.
CREATE TABLE public.leave_booking_followups (
  leave_id uuid NOT NULL REFERENCES public.employee_leaves(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  contact_status text NOT NULL DEFAULT 'NOT_CONTACTED'
    CHECK (contact_status IN ('NOT_CONTACTED', 'WAITING_REPLY', 'CUSTOMER_AGREED')),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (leave_id, appointment_id)
);

CREATE INDEX leave_booking_approved_lookup ON public.employee_leaves(employee_id, outlet_id, start_at, end_at)
  WHERE status = 'APPROVED';

ALTER TABLE public.leave_booking_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_booking_followups FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.leave_booking_followups FROM PUBLIC, anon, authenticated;

-- Serialize a leave approval with an appointment for the same barber.
CREATE FUNCTION public._lock_leave_barber() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.employee_id::text, 0));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._lock_leave_barber() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lock_leave_barber BEFORE INSERT OR UPDATE OF employee_id, outlet_id, start_at, end_at, status
  ON public.employee_leaves FOR EACH ROW EXECUTE FUNCTION public._lock_leave_barber();

CREATE FUNCTION public._reject_appointment_during_leave() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('PENDING', 'CONFIRMED') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.barber_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.employee_leaves l
      WHERE l.employee_id = NEW.barber_id AND l.outlet_id = NEW.outlet_id
        AND l.status = 'APPROVED'
        AND NEW.start_at < l.end_at AND NEW.end_at > l.start_at
    ) THEN
      RAISE EXCEPTION 'Kapster sedang cuti pada jadwal booking tersebut'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._reject_appointment_during_leave() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reject_appointment_during_leave
  BEFORE INSERT OR UPDATE OF barber_id, outlet_id, start_at, end_at, status
  ON public.appointments FOR EACH ROW EXECUTE FUNCTION public._reject_appointment_during_leave();

-- The existing slot RPC checks occupancy but not leave. Keep its validation intact.
ALTER FUNCTION public.get_public_booking_slots(uuid, date, uuid, uuid)
  RENAME TO _base_get_public_booking_slots;
REVOKE ALL ON FUNCTION public._base_get_public_booking_slots(uuid, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_public_booking_slots(
  p_outlet_id uuid, p_date date, p_barber_id uuid DEFAULT NULL, p_service_id uuid DEFAULT NULL
) RETURNS TABLE(time_slot varchar, is_available boolean, available_barbers_count integer, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_slot record;
  v_timezone text;
  v_duration integer;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_on_leave_free integer;
BEGIN
  SELECT COALESCE(o.timezone, 'Asia/Jakarta'), s.duration_minutes
    INTO v_timezone, v_duration
  FROM public.outlets o CROSS JOIN public.services s
  WHERE o.id = p_outlet_id AND s.id = p_service_id;

  FOR v_slot IN SELECT * FROM public._base_get_public_booking_slots(
    p_outlet_id, p_date, p_barber_id, p_service_id
  ) LOOP
    v_start_at := (p_date::text || ' ' || v_slot.time_slot)::timestamp AT TIME ZONE v_timezone;
    v_end_at := v_start_at + pg_catalog.make_interval(mins => v_duration);

    IF p_barber_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.employee_leaves l
        WHERE l.employee_id = p_barber_id AND l.outlet_id = p_outlet_id
          AND l.status = 'APPROVED'
          AND v_start_at < l.end_at AND v_end_at > l.start_at
      ) THEN
        v_slot.is_available := false;
        v_slot.available_barbers_count := 0;
        v_slot.reason := 'Kapster sedang cuti';
      END IF;
    ELSIF v_slot.is_available THEN
      SELECT count(*)::integer INTO v_on_leave_free
      FROM public.employees e
      WHERE e.is_active = true
        AND (EXISTS (
          SELECT 1 FROM public.employee_outlets eo WHERE eo.employee_id = e.id
            AND eo.outlet_id = p_outlet_id AND eo.is_active = true
        ) OR NOT EXISTS (SELECT 1 FROM public.employee_outlets eo WHERE eo.employee_id = e.id))
        AND EXISTS (
          SELECT 1 FROM public.employee_leaves l
          WHERE l.employee_id = e.id AND l.outlet_id = p_outlet_id
            AND l.status = 'APPROVED'
            AND v_start_at < l.end_at AND v_end_at > l.start_at
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.appointments a WHERE a.barber_id = e.id
            AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
            AND a.start_at < v_end_at AND a.end_at > v_start_at
        );
      v_slot.available_barbers_count := GREATEST(
        v_slot.available_barbers_count - v_on_leave_free, 0
      );
      v_slot.is_available := v_slot.available_barbers_count > 0;
      IF NOT v_slot.is_available THEN v_slot.reason := 'Kapster tidak tersedia'; END IF;
    END IF;
    time_slot := v_slot.time_slot;
    is_available := v_slot.is_available;
    available_barbers_count := v_slot.available_barbers_count;
    reason := v_slot.reason;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_booking_slots(uuid, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_booking_slots(uuid, date, uuid, uuid)
  TO anon, authenticated, service_role;

CREATE FUNCTION public.list_leave_booking_impacts(p_outlet_id uuid DEFAULT NULL)
RETURNS TABLE(
  leave_id uuid, appointment_id uuid, appointment_number varchar,
  outlet_id uuid, outlet_name varchar, barber_id uuid, barber_name varchar,
  leave_status public.leave_status_enum, appointment_status public.appointment_status_enum,
  start_at timestamptz, end_at timestamptz, customer_name text,
  customer_phone text, service_name varchar, contact_status text,
  contact_updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_outlet_id IS NOT NULL AND NOT public.current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'Akses cabang ditolak' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT l.id, a.id, a.appointment_number, a.outlet_id, o.name,
    e.id, e.full_name, l.status, a.status, a.start_at, a.end_at,
    COALESCE(NULLIF(a.guest_customer_name, ''), c.full_name, 'Pelanggan')::text,
    COALESCE(NULLIF(a.guest_customer_phone, ''), c.phone, '')::text,
    s.name, COALESCE(f.contact_status, 'NOT_CONTACTED'), f.updated_at
  FROM public.employee_leaves l
  JOIN public.appointments a ON a.barber_id = l.employee_id AND a.outlet_id = l.outlet_id
    AND a.start_at < l.end_at AND a.end_at > l.start_at
  JOIN public.outlets o ON o.id = a.outlet_id
  JOIN public.employees e ON e.id = a.barber_id
  JOIN public.services s ON s.id = a.service_id
  LEFT JOIN public.customers c ON c.id = a.customer_id
  LEFT JOIN public.leave_booking_followups f ON f.leave_id = l.id AND f.appointment_id = a.id
  WHERE l.status IN ('PENDING', 'APPROVED')
    AND a.status IN ('PENDING', 'CONFIRMED')
    AND a.end_at > now()
    AND (p_outlet_id IS NULL OR a.outlet_id = p_outlet_id)
    AND public.current_user_has_outlet_access(a.outlet_id)
  ORDER BY a.start_at;
END;
$$;
REVOKE ALL ON FUNCTION public.list_leave_booking_impacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_leave_booking_impacts(uuid) TO authenticated, service_role;

CREATE FUNCTION public.set_leave_booking_contact_status(
  p_leave_id uuid, p_appointment_id uuid, p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_outlet_id uuid;
BEGIN
  IF p_status NOT IN ('NOT_CONTACTED', 'WAITING_REPLY', 'CUSTOMER_AGREED') THEN
    RAISE EXCEPTION 'Status komunikasi tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT a.outlet_id INTO v_outlet_id
  FROM public.appointments a JOIN public.employee_leaves l
    ON l.id = p_leave_id AND l.employee_id = a.barber_id AND l.outlet_id = a.outlet_id
    AND a.start_at < l.end_at AND a.end_at > l.start_at
  WHERE a.id = p_appointment_id AND a.status IN ('PENDING', 'CONFIRMED')
    AND l.status IN ('PENDING', 'APPROVED');
  IF v_outlet_id IS NULL OR auth.uid() IS NULL
     OR NOT public.current_user_has_outlet_access(v_outlet_id) THEN
    RAISE EXCEPTION 'Booking terdampak tidak ditemukan atau akses ditolak' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.leave_booking_followups(leave_id, appointment_id, contact_status, updated_by)
  VALUES (p_leave_id, p_appointment_id, p_status, public._security_current_actor_profile(NULL))
  ON CONFLICT (leave_id, appointment_id) DO UPDATE
    SET contact_status = EXCLUDED.contact_status,
        updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_leave_booking_contact_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_leave_booking_contact_status(uuid, uuid, text)
  TO authenticated, service_role;

CREATE FUNCTION public.rebook_impacted_appointment(
  p_leave_id uuid, p_appointment_id uuid, p_barber_id uuid, p_start_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_apt public.appointments%ROWTYPE; v_duration integer; v_end_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR p_start_at IS NULL OR p_barber_id IS NULL OR p_start_at <= now() THEN
    RAISE EXCEPTION 'Jadwal pengganti harus di masa depan' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_apt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND OR NOT public.current_user_has_outlet_access(v_apt.outlet_id) THEN
    RAISE EXCEPTION 'Janji temu tidak ditemukan atau akses ditolak' USING ERRCODE = '42501';
  END IF;
  IF v_apt.status NOT IN ('PENDING', 'CONFIRMED') OR NOT EXISTS (
    SELECT 1 FROM public.employee_leaves l WHERE l.id = p_leave_id
      AND l.employee_id = v_apt.barber_id AND l.outlet_id = v_apt.outlet_id
      AND l.status = 'APPROVED' AND v_apt.start_at < l.end_at AND v_apt.end_at > l.start_at
  ) THEN
    RAISE EXCEPTION 'Janji temu bukan booking terdampak cuti aktif' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_booking_followups f WHERE f.leave_id = p_leave_id
      AND f.appointment_id = p_appointment_id AND f.contact_status = 'CUSTOMER_AGREED'
  ) THEN
    RAISE EXCEPTION 'Persetujuan pelanggan harus dicatat terlebih dahulu' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.queues q WHERE q.appointment_id = p_appointment_id
    AND q.status IN ('WAITING', 'CALLED', 'IN_SERVICE')) THEN
    RAISE EXCEPTION 'Booking yang sudah antre tidak dapat dipindahkan' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e JOIN public.employee_outlets eo
      ON eo.employee_id = e.id AND eo.outlet_id = v_apt.outlet_id AND eo.is_active = true
    WHERE e.id = p_barber_id AND e.is_active = true
      AND (lower(e.position) LIKE '%barber%' OR lower(e.position) LIKE '%kapster%')
  ) THEN
    RAISE EXCEPTION 'Kapster pengganti tidak aktif di cabang ini' USING ERRCODE = '22023';
  END IF;
  SELECT duration_minutes INTO v_duration FROM public.services WHERE id = v_apt.service_id;
  v_end_at := p_start_at + pg_catalog.make_interval(mins => v_duration);
  BEGIN
    UPDATE public.appointments SET barber_id = p_barber_id, start_at = p_start_at,
      end_at = v_end_at, updated_at = now() WHERE id = p_appointment_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Kapster sudah memiliki booking pada jam tersebut' USING ERRCODE = '22023';
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.rebook_impacted_appointment(uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebook_impacted_appointment(uuid, uuid, uuid, timestamptz)
  TO authenticated, service_role;

-- Public 'any barber' bookings must pick only barbers who are not on leave.
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
      SELECT 1 FROM public.employee_leaves l
      WHERE l.employee_id = v_barber_id AND l.outlet_id = p_outlet_id
        AND l.status = 'APPROVED'
        AND v_start_at < l.end_at AND v_end_at > l.start_at
    ) THEN
      RAISE EXCEPTION 'Kapster sedang cuti pada jadwal tersebut. Pilih kapster atau jam lain.';
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
       AND NOT EXISTS (
         SELECT 1 FROM public.employee_leaves l
         WHERE l.employee_id = e.id AND l.outlet_id = p_outlet_id
           AND l.status = 'APPROVED'
           AND v_start_at < l.end_at AND v_end_at > l.start_at
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
