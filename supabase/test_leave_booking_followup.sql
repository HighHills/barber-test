-- Run against the local Supabase database with psql. The transaction leaves no fixtures behind.
BEGIN;

DO $$
DECLARE
  v_outlet uuid;
  v_category uuid;
  v_service uuid;
  v_barber uuid;
  v_replacement uuid;
  v_appointment uuid;
  v_leave uuid;
  v_role uuid;
  v_profile uuid;
  v_permission uuid;
  v_barber_role uuid;
  v_barber_profile uuid;
  v_auth_user uuid := gen_random_uuid();
  v_barber_auth_user uuid := gen_random_uuid();
  v_day date := (now() AT TIME ZONE 'Asia/Jakarta')::date + 3;
  v_start timestamptz;
  v_rejected boolean := false;
BEGIN
  v_start := (v_day::text || ' 10:00')::timestamp AT TIME ZONE 'Asia/Jakarta';
  INSERT INTO public.outlets(code, name) VALUES ('TEST-LEAVE', 'Test Leave Outlet') RETURNING id INTO v_outlet;
  INSERT INTO public.service_categories(name) VALUES ('Test Leave Category') RETURNING id INTO v_category;
  INSERT INTO public.services(category_id, code, name, duration_minutes)
    VALUES (v_category, 'TEST-LEAVE', 'Test Leave Service', 30) RETURNING id INTO v_service;
  INSERT INTO public.service_outlets(service_id, outlet_id, selling_price)
    VALUES (v_service, v_outlet, 50000);
  INSERT INTO public.employees(employee_code, full_name, position)
    VALUES ('TEST-LEAVE-1', 'Test Barber', 'BARBER') RETURNING id INTO v_barber;
  INSERT INTO public.employees(employee_code, full_name, position)
    VALUES ('TEST-LEAVE-2', 'Test Replacement', 'BARBER') RETURNING id INTO v_replacement;
  INSERT INTO public.employee_outlets(employee_id, outlet_id)
    VALUES (v_barber, v_outlet), (v_replacement, v_outlet);
  SELECT id INTO v_role FROM public.roles WHERE code = 'OWNER';
  IF v_role IS NULL THEN
    INSERT INTO public.roles(code, name) VALUES ('OWNER', 'Test Leave Owner') RETURNING id INTO v_role;
  END IF;
  SELECT id INTO v_permission FROM public.permissions WHERE code = 'booking.manage';
  IF v_permission IS NULL THEN
    INSERT INTO public.permissions(code, name, module)
      VALUES ('booking.manage', 'Manage Bookings', 'booking') RETURNING id INTO v_permission;
  END IF;
  INSERT INTO public.role_permissions(role_id, permission_id)
    VALUES (v_role, v_permission) ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles(auth_user_id, display_name)
    VALUES (v_auth_user, 'Test Leave Owner') RETURNING id INTO v_profile;
  INSERT INTO public.user_roles(user_id, role_id) VALUES (v_profile, v_role);
  SELECT id INTO v_barber_role FROM public.roles WHERE code = 'BARBER';
  IF v_barber_role IS NULL THEN
    INSERT INTO public.roles(code, name) VALUES ('BARBER', 'Test Barber Role') RETURNING id INTO v_barber_role;
  END IF;
  INSERT INTO public.profiles(auth_user_id, display_name)
    VALUES (v_barber_auth_user, 'Test Barber User') RETURNING id INTO v_barber_profile;
  INSERT INTO public.user_roles(user_id, role_id, outlet_id)
    VALUES (v_barber_profile, v_barber_role, v_outlet);
  PERFORM set_config('request.jwt.claim.sub', v_auth_user::text, true);

  INSERT INTO public.appointments(appointment_number, outlet_id, service_id, barber_id,
    start_at, end_at, status, guest_customer_name, guest_customer_phone)
    VALUES ('TEST-LEAVE-APT', v_outlet, v_service, v_barber,
      v_start, v_start + interval '30 minutes', 'CONFIRMED', 'Test Customer', '081234567890')
    RETURNING id INTO v_appointment;
  INSERT INTO public.employee_leaves(employee_id, outlet_id, start_at, end_at, reason, status)
    VALUES (v_barber, v_outlet, v_start - interval '1 hour', v_start + interval '2 hours',
      'Test leave', 'PENDING') RETURNING id INTO v_leave;

  IF (SELECT count(*) FROM public.list_leave_booking_impacts(v_outlet)) <> 1 THEN
    RAISE EXCEPTION 'Pending leave impact was not listed';
  END IF;
  UPDATE public.employee_leaves SET status = 'APPROVED' WHERE id = v_leave;

  BEGIN
    INSERT INTO public.appointments(appointment_number, outlet_id, service_id, barber_id,
      start_at, end_at, status) VALUES ('TEST-LEAVE-REJECT', v_outlet, v_service,
      v_barber, v_start + interval '30 minutes', v_start + interval '60 minutes', 'CONFIRMED');
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Booking during approved leave was accepted'; END IF;

  IF (SELECT is_available FROM public.get_public_booking_slots(
    v_outlet, v_day, v_barber, v_service) WHERE time_slot = '11:00') THEN
    RAISE EXCEPTION 'Public slot still advertises a barber on leave';
  END IF;
  IF (SELECT available_barbers_count FROM public.get_public_booking_slots(
    v_outlet, v_day, NULL, v_service) WHERE time_slot = '11:00') <> 1 THEN
    RAISE EXCEPTION 'Any-barber slot count still includes a barber on leave';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public._legacy_create_public_booking(v_outlet, v_service, v_day, '11:00'::time,
      'Test Customer', '081234567891', v_barber);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%sedang cuti%' THEN v_rejected := true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Public booking accepted a barber on leave'; END IF;
  IF (public._legacy_create_public_booking(v_outlet, v_service, v_day, '11:00'::time,
    'Test Customer', '081234567892', NULL)->>'barber_id')::uuid <> v_replacement THEN
    RAISE EXCEPTION 'Any-barber booking did not choose the available replacement';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.rebook_impacted_appointment(v_leave, v_appointment, v_replacement, v_start);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Rebooking without customer agreement was accepted'; END IF;

  PERFORM public.set_leave_booking_contact_status(v_leave, v_appointment, 'WAITING_REPLY');
  IF (SELECT contact_status FROM public.list_leave_booking_impacts(v_outlet)) <> 'WAITING_REPLY' THEN
    RAISE EXCEPTION 'Contact status was not visible';
  END IF;
  PERFORM public.set_leave_booking_contact_status(v_leave, v_appointment, 'CUSTOMER_AGREED');
  PERFORM set_config('request.jwt.claim.sub', v_barber_auth_user::text, true);
  IF (SELECT count(*) FROM public.list_leave_booking_impacts(v_outlet)) <> 0 THEN
    RAISE EXCEPTION 'User without booking.manage can see customer follow-ups';
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.set_leave_booking_contact_status(v_leave, v_appointment, 'WAITING_REPLY');
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Barber could change contact status'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.rebook_impacted_appointment(v_leave, v_appointment, v_replacement, v_start);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Barber could rebook customer'; END IF;
  IF has_function_privilege('authenticated',
    'public._base_rebook_impacted_appointment(uuid,uuid,uuid,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated user can call the unguarded rebooking function';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_auth_user::text, true);
  PERFORM public.rebook_impacted_appointment(v_leave, v_appointment, v_replacement, v_start);
  IF (SELECT count(*) FROM public.list_leave_booking_impacts(v_outlet)) <> 0 THEN
    RAISE EXCEPTION 'Resolved booking remains in impact list';
  END IF;
  IF (SELECT barber_id FROM public.appointments WHERE id = v_appointment) <> v_replacement THEN
    RAISE EXCEPTION 'Booking was not reassigned';
  END IF;
  RAISE NOTICE 'Leave booking follow-up integration checks passed';
END $$;

ROLLBACK;
