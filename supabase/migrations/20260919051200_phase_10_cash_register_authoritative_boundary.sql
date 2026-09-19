-- Phase 10: authoritative cash register provisioning boundary

CREATE OR REPLACE FUNCTION public.ensure_cash_register(
  p_outlet_id uuid
)
RETURNS public.cash_registers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_register public.cash_registers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan' USING ERRCODE = '42501';
  END IF;

  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Outlet wajib ditentukan' USING ERRCODE = '22023';
  END IF;

  IF NOT current_user_has_outlet_access(p_outlet_id) THEN
    RAISE EXCEPTION 'User tidak memiliki akses ke outlet %', p_outlet_id USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_register
    FROM cash_registers
   WHERE outlet_id = p_outlet_id
     AND is_active = TRUE
   ORDER BY created_at ASC
   LIMIT 1;

  IF FOUND THEN
    RETURN v_register;
  END IF;

  IF NOT is_owner_or_admin() THEN
    RAISE EXCEPTION
      'Register kasir belum tersedia untuk outlet %. Hanya OWNER/ADMIN yang dapat membuat register baru.',
      p_outlet_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO cash_registers (
    outlet_id,
    name,
    is_active
  )
  VALUES (
    p_outlet_id,
    'Kasir Utama 01',
    TRUE
  )
  RETURNING * INTO v_register;

  RETURN v_register;
EXCEPTION
  WHEN unique_violation THEN
    SELECT *
      INTO v_register
      FROM cash_registers
     WHERE outlet_id = p_outlet_id
       AND is_active = TRUE
     ORDER BY created_at ASC
     LIMIT 1;

    IF FOUND THEN
      RETURN v_register;
    END IF;

    RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_cash_register(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_cash_register(uuid) TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.cash_registers
FROM anon, authenticated, PUBLIC;
