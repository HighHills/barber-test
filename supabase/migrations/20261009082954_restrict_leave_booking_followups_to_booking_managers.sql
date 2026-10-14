-- Keep the original validations; only booking managers may see or resolve customer follow-ups.
ALTER FUNCTION public.list_leave_booking_impacts(uuid) RENAME TO _base_list_leave_booking_impacts;
ALTER FUNCTION public.set_leave_booking_contact_status(uuid, uuid, text) RENAME TO _base_set_leave_booking_contact_status;
ALTER FUNCTION public.rebook_impacted_appointment(uuid, uuid, uuid, timestamptz) RENAME TO _base_rebook_impacted_appointment;

REVOKE ALL ON FUNCTION public._base_list_leave_booking_impacts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._base_set_leave_booking_contact_status(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._base_rebook_impacted_appointment(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.list_leave_booking_impacts(p_outlet_id uuid DEFAULT NULL)
RETURNS TABLE(
  leave_id uuid, appointment_id uuid, appointment_number varchar,
  outlet_id uuid, outlet_name varchar, barber_id uuid, barber_name varchar,
  leave_status public.leave_status_enum, appointment_status public.appointment_status_enum,
  start_at timestamptz, end_at timestamptz, customer_name text,
  customer_phone text, service_name varchar, contact_status text,
  contact_updated_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT impact.* FROM public._base_list_leave_booking_impacts(p_outlet_id) impact
  WHERE public.current_user_has_permission('booking.manage', impact.outlet_id);
$$;
REVOKE ALL ON FUNCTION public.list_leave_booking_impacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_leave_booking_impacts(uuid) TO authenticated, service_role;

CREATE FUNCTION public.set_leave_booking_contact_status(
  p_leave_id uuid, p_appointment_id uuid, p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.appointments a WHERE a.id = p_appointment_id
      AND public.current_user_has_permission('booking.manage', a.outlet_id)
  ) THEN
    RAISE EXCEPTION 'Akses kelola booking ditolak' USING ERRCODE = '42501';
  END IF;
  PERFORM public._base_set_leave_booking_contact_status(p_leave_id, p_appointment_id, p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.set_leave_booking_contact_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_leave_booking_contact_status(uuid, uuid, text)
  TO authenticated, service_role;

CREATE FUNCTION public.rebook_impacted_appointment(
  p_leave_id uuid, p_appointment_id uuid, p_barber_id uuid, p_start_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.appointments a WHERE a.id = p_appointment_id
      AND public.current_user_has_permission('booking.manage', a.outlet_id)
  ) THEN
    RAISE EXCEPTION 'Akses kelola booking ditolak' USING ERRCODE = '42501';
  END IF;
  PERFORM public._base_rebook_impacted_appointment(
    p_leave_id, p_appointment_id, p_barber_id, p_start_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rebook_impacted_appointment(uuid, uuid, uuid, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebook_impacted_appointment(uuid, uuid, uuid, timestamptz)
  TO authenticated, service_role;
