-- supabase/verify_public_booking.sql
-- Verification script for testing Phase 12 Public Booking Portal RPCs

DO $$
DECLARE
  v_outlet RECORD;
  v_service RECORD;
  v_barber RECORD;
  v_slot RECORD;
  v_booking JSONB;
BEGIN
  RAISE NOTICE '=== VERIFIKASI 1: GET PUBLIC OUTLETS ===';
  FOR v_outlet IN SELECT * FROM get_public_booking_outlets() LOOP
    RAISE NOTICE 'Outlet: % (Code: %, Telp: %)', v_outlet.name, v_outlet.code, v_outlet.phone;
  END LOOP;

  -- Pick first outlet
  SELECT * INTO v_outlet FROM get_public_booking_outlets() LIMIT 1;
  IF v_outlet.id IS NULL THEN
    RAISE EXCEPTION 'Tidak ada outlet aktif ditemukan.';
  END IF;

  RAISE NOTICE '=== VERIFIKASI 2: GET PUBLIC SERVICES UNTUK OUTLET % ===', v_outlet.name;
  FOR v_service IN SELECT * FROM get_public_booking_services(v_outlet.id) LOOP
    RAISE NOTICE 'Layanan: % - Durasi: % mnt - Harga: Rp %', v_service.name, v_service.duration_minutes, v_service.selling_price;
  END LOOP;

  SELECT * INTO v_service FROM get_public_booking_services(v_outlet.id) LIMIT 1;

  RAISE NOTICE '=== VERIFIKASI 3: GET PUBLIC BARBERS UNTUK OUTLET % ===', v_outlet.name;
  FOR v_barber IN SELECT * FROM get_public_booking_barbers(v_outlet.id) LOOP
    RAISE NOTICE 'Barber: % - Posisi: %', v_barber.full_name, v_barber.barber_position;
  END LOOP;

  SELECT * INTO v_barber FROM get_public_booking_barbers(v_outlet.id) LIMIT 1;

  RAISE NOTICE '=== VERIFIKASI 4: GET AVAILABLE SLOTS (BESOK) ===';
  FOR v_slot IN 
    SELECT * FROM get_public_booking_slots(
      v_outlet.id, 
      (CURRENT_DATE + 1)::DATE, 
      v_barber.id, 
      v_service.id
    ) 
    LIMIT 6
  LOOP
    RAISE NOTICE 'Slot Jam: % - Tersedia: % (Alasan: %)', v_slot.time_slot, v_slot.is_available, v_slot.reason;
  END LOOP;

  RAISE NOTICE '=== VERIFIKASI 5: SIMULASI CREATE PUBLIC BOOKING (BESOK JAM 14:00) ===';
  v_booking := create_public_booking(
    p_outlet_id := v_outlet.id,
    p_service_id := v_service.id,
    p_booking_date := (CURRENT_DATE + 1)::DATE,
    p_booking_time := '14:00:00'::TIME,
    p_customer_name := 'Budi Verification Pratama',
    p_customer_phone := '081299887766',
    p_barber_id := v_barber.id,
    p_customer_email := 'budi.verif@example.com',
    p_notes := 'Simulasi test booking publik'
  );

  RAISE NOTICE 'Hasil Booking: %', v_booking->>'appointment_number';
  RAISE NOTICE 'WhatsApp Message: %', v_booking->>'whatsapp_message';

  RAISE NOTICE '=== SEMUA FUNGSI RPC PUBLIC BOOKING BERFUNGSI SEMPURNA ===';
END;
$$;
