-- 20260904000016_cashier_subaccounts_and_rbac.sql
-- Sub-Akun Kasir (Cashier RBAC & Multi-Outlet Assignment)
-- Only OWNER or ADMIN can create, assign, and manage Cashier sub-accounts.

-- 1. Function: create_cashier_subaccount
CREATE OR REPLACE FUNCTION create_cashier_subaccount(
  p_email TEXT,
  p_password TEXT,
  p_display_name TEXT,
  p_phone TEXT,
  p_outlet_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_cashier_role_id UUID;
  v_auth_user_id UUID;
  v_profile_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  -- 1. Security Check: Only OWNER or ADMIN (or Superuser in SQL Editor) can create cashier accounts
  IF auth.uid() IS NOT NULL AND NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang berhak membuat sub-akun kasir' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate input parameters
  IF p_email IS NULL OR length(trim(p_email)) < 5 THEN
    RAISE EXCEPTION 'Format email kasir tidak valid';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password akun kasir minimal 6 karakter';
  END IF;
  IF p_display_name IS NULL OR length(trim(p_display_name)) < 2 THEN
    RAISE EXCEPTION 'Nama kasir wajib diisi';
  END IF;
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'Outlet penugasan kasir wajib ditentukan';
  END IF;

  -- 3. Verify outlet exists and is active
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id = p_outlet_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Outlet tujuan tidak ditemukan atau tidak aktif';
  END IF;

  -- 4. Get CASHIER role ID
  SELECT id INTO v_cashier_role_id FROM roles WHERE code = 'CASHIER' LIMIT 1;
  IF v_cashier_role_id IS NULL THEN
    RAISE EXCEPTION 'Role CASHIER belum terdaftar di database';
  END IF;

  -- 5. Resolve caller profile
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_caller_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  -- 6. Check if email already registered in auth.users
  SELECT id INTO v_auth_user_id FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := gen_random_uuid();
    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_auth_user_id,
      'authenticated',
      'authenticated',
      lower(trim(p_email)),
      v_encrypted_pw,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', trim(p_display_name), 'phone', trim(p_phone)),
      now(),
      now()
    );
  ELSE
    -- User exists, update password if provided
    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = now()
    WHERE id = v_auth_user_id;
  END IF;

  -- 7. Create or update profile
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = v_auth_user_id LIMIT 1;
  IF v_profile_id IS NULL THEN
    INSERT INTO profiles (
      auth_user_id,
      display_name,
      phone,
      is_active
    ) VALUES (
      v_auth_user_id,
      trim(p_display_name),
      trim(p_phone),
      TRUE
    ) RETURNING id INTO v_profile_id;
  ELSE
    UPDATE profiles
    SET display_name = trim(p_display_name),
        phone = COALESCE(trim(p_phone), phone),
        is_active = TRUE,
        updated_at = now()
    WHERE id = v_profile_id;
  END IF;

  -- 8. Assign to user_roles with strict outlet lock
  DELETE FROM user_roles WHERE user_id = v_profile_id AND role_id = v_cashier_role_id;

  INSERT INTO user_roles (
    user_id,
    role_id,
    outlet_id,
    created_by
  ) VALUES (
    v_profile_id,
    v_cashier_role_id,
    p_outlet_id,
    v_caller_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', v_profile_id,
    'auth_user_id', v_auth_user_id,
    'display_name', trim(p_display_name),
    'outlet_id', p_outlet_id,
    'message', 'Sub-akun kasir berhasil dibuat dan ditugaskan ke outlet'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions, pg_temp;

-- 2. Function: list_cashier_subaccounts
CREATE OR REPLACE FUNCTION list_cashier_subaccounts()
RETURNS TABLE (
  id UUID,
  display_name VARCHAR,
  phone VARCHAR,
  email VARCHAR,
  outlet_id UUID,
  outlet_name VARCHAR,
  outlet_code VARCHAR,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang berhak melihat daftar sub-akun kasir' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.phone,
    u.email::VARCHAR,
    ur.outlet_id,
    o.name AS outlet_name,
    o.code AS outlet_code,
    p.is_active,
    ur.created_at
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id
  JOIN roles r ON r.id = ur.role_id AND r.code = 'CASHIER'
  LEFT JOIN outlets o ON o.id = ur.outlet_id
  LEFT JOIN auth.users u ON u.id = p.auth_user_id
  ORDER BY ur.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

-- 3. Function: toggle_cashier_status
CREATE OR REPLACE FUNCTION toggle_cashier_status(
  p_profile_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSONB AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_owner_or_admin() THEN
    RAISE EXCEPTION 'Hanya OWNER atau ADMIN yang berhak mengubah status sub-akun' USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', p_profile_id,
    'is_active', p_is_active
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Grant permissions to authenticated role
GRANT EXECUTE ON FUNCTION create_cashier_subaccount(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION list_cashier_subaccounts() TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_cashier_status(UUID, BOOLEAN) TO authenticated;
