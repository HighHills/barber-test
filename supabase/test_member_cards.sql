-- Run against local Supabase with psql; transaction leaves no fixtures behind.
BEGIN;

DO $$
DECLARE
  v_owner_role uuid;
  v_profile uuid;
  v_auth_user uuid := gen_random_uuid();
  v_customer_id uuid;
  v_second_id uuid;
  v_first jsonb;
  v_again jsonb;
  v_second jsonb;
  v_public jsonb;
BEGIN
  SELECT id INTO v_owner_role FROM public.roles WHERE code = 'OWNER' LIMIT 1;
  IF v_owner_role IS NULL THEN
    INSERT INTO public.roles(code, name) VALUES ('OWNER', 'Test Owner') RETURNING id INTO v_owner_role;
  END IF;
  INSERT INTO public.profiles(auth_user_id, display_name)
    VALUES (v_auth_user, 'Member Card Test Owner') RETURNING id INTO v_profile;
  INSERT INTO public.user_roles(user_id, role_id) VALUES (v_profile, v_owner_role);
  PERFORM set_config('request.jwt.claim.sub', v_auth_user::text, true);
  IF NOT EXISTS (SELECT 1 FROM public.business_settings) THEN
    INSERT INTO public.business_settings(business_name) VALUES ('Test Barber');
  END IF;

  PERFORM public.save_member_card_settings('First Brand', 'https://example.com/first.png',
    'https://example.com/first-bg.jpg', FALSE, 1);
  v_customer_id := (public.create_customer(p_full_name => 'Test Member One', p_phone => '081234567890')->>'id')::uuid;
  v_first := public.issue_member_card(v_customer_id);
  IF v_first->>'brand' <> 'First Brand' OR v_first->>'expires_at' IS NULL THEN
    RAISE EXCEPTION 'First card did not snapshot the configured name and expiry';
  END IF;

  PERFORM public.save_member_card_settings('Second Brand', NULL, NULL, TRUE, 12);
  v_again := public.issue_member_card(v_customer_id);
  IF v_again->>'token' <> v_first->>'token' OR v_again->>'brand' <> 'First Brand' OR v_again->>'expires_at' <> v_first->>'expires_at' THEN
    RAISE EXCEPTION 'Settings change altered an existing card';
  END IF;
  v_public := public.get_public_member_card((v_first->>'token')::uuid);
  IF v_public->>'name' <> 'Test Member One' OR v_public ? 'phone' OR v_public ? 'email' THEN
    RAISE EXCEPTION 'Public card is missing its name or exposes contact data';
  END IF;

  v_second_id := (public.create_customer(p_full_name => 'Test Member Two', p_phone => '081234567891')->>'id')::uuid;
  v_second := public.issue_member_card(v_second_id);
  IF v_second->>'brand' <> 'Second Brand' OR v_second->>'expires_at' IS NOT NULL THEN
    RAISE EXCEPTION 'New lifetime card did not use the new settings';
  END IF;
  UPDATE public.customers SET member_card_expires_at = NOW() - INTERVAL '1 day'
    WHERE id = v_customer_id;
  v_again := public.issue_member_card(v_customer_id);
  IF v_again->>'token' = v_first->>'token' OR v_again->>'brand' <> 'Second Brand'
     OR public.get_public_member_card((v_first->>'token')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'Expired card was not replaced with a new card';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_public_member_card(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.issue_member_card(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public function grants are incorrect';
  END IF;
END;
$$;

ROLLBACK;
