-- Harden legacy cashier status toggle to a cashier-only target boundary.
CREATE OR REPLACE FUNCTION public.toggle_cashier_status(
  p_profile_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, auth, extensions, pg_temp
AS $function$
DECLARE
  v_jwt_role text := COALESCE(current_setting('request.jwt.claim.role', TRUE), '');
  v_target_is_cashier boolean;
BEGIN
  IF auth.uid() IS NULL AND v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'Autentikasi diperlukan' USING ERRCODE='42501';
  END IF;

  IF v_jwt_role <> 'service_role' AND NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang berhak mengubah status sub-akun' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN profiles p ON p.id = ur.user_id
    WHERE ur.user_id = p_profile_id
      AND r.code = 'CASHIER'
      AND r.is_active = true
      AND p.is_active IS NOT NULL
  ) INTO v_target_is_cashier;

  IF NOT v_target_is_cashier THEN
    RAISE EXCEPTION 'Profil target bukan sub-akun CASHIER yang valid' USING ERRCODE='42501';
  END IF;

  UPDATE profiles
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil sub-akun kasir tidak ditemukan' USING ERRCODE='P0002';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', p_profile_id,
    'is_active', p_is_active
  );
END;
$function$;
