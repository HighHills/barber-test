-- A card keeps its design and expiry as issued; changing settings affects future cards only.
ALTER TABLE public.business_settings
  ADD COLUMN member_card_name TEXT,
  ADD COLUMN member_card_logo_url TEXT,
  ADD COLUMN member_card_background_url TEXT,
  ADD COLUMN member_card_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN member_card_validity_months INTEGER NOT NULL DEFAULT 12
    CHECK (member_card_validity_months BETWEEN 1 AND 1200);

ALTER TABLE public.customers
  ADD COLUMN member_card_token UUID UNIQUE,
  ADD COLUMN member_card_issued_at TIMESTAMPTZ,
  ADD COLUMN member_card_expires_at TIMESTAMPTZ,
  ADD COLUMN member_card_name TEXT,
  ADD COLUMN member_card_logo_url TEXT,
  ADD COLUMN member_card_background_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('member-card-assets', 'member-card-assets', TRUE, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "member_card_assets_owner_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-card-assets' AND public.is_owner_or_admin());

CREATE OR REPLACE FUNCTION public.save_member_card_settings(
  p_name TEXT, p_logo_url TEXT, p_background_url TEXT,
  p_lifetime BOOLEAN, p_validity_months INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner_or_admin() THEN
    RAISE EXCEPTION 'MEMBER_CARD_SETTINGS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(BTRIM(p_name), '') IS NULL OR LENGTH(BTRIM(p_name)) > 100 THEN
    RAISE EXCEPTION 'MEMBER_CARD_NAME_INVALID';
  END IF;
  IF p_validity_months IS NULL OR p_validity_months NOT BETWEEN 1 AND 1200 THEN
    RAISE EXCEPTION 'MEMBER_CARD_VALIDITY_INVALID';
  END IF;
  IF p_lifetime IS NULL THEN RAISE EXCEPTION 'MEMBER_CARD_LIFETIME_INVALID'; END IF;
  IF (p_logo_url IS NOT NULL AND (LENGTH(p_logo_url) > 2048 OR p_logo_url !~* '^https://[^[:space:]]+$'))
     OR (p_background_url IS NOT NULL AND (LENGTH(p_background_url) > 2048 OR p_background_url !~* '^https://[^[:space:]]+$')) THEN
    RAISE EXCEPTION 'MEMBER_CARD_IMAGE_URL_INVALID';
  END IF;
  UPDATE public.business_settings SET
    member_card_name = BTRIM(p_name),
    member_card_logo_url = p_logo_url,
    member_card_background_url = p_background_url,
    member_card_lifetime = p_lifetime,
    member_card_validity_months = p_validity_months,
    updated_at = NOW();
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_SETTINGS_MISSING'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_member_card(p_customer_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_card public.customers%ROWTYPE;
  v_settings public.business_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_owner_or_admin()
    OR public.current_user_has_permission('booking.manage')
    OR public.current_user_has_permission('pos.sale.create')
  ) THEN
    RAISE EXCEPTION 'MEMBER_CARD_ISSUE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_settings FROM public.business_settings LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_SETTINGS_MISSING'; END IF;
  UPDATE public.customers c SET
    member_card_token = gen_random_uuid(),
    member_card_issued_at = NOW(),
    member_card_expires_at = CASE WHEN v_settings.member_card_lifetime THEN NULL
      ELSE NOW() + MAKE_INTERVAL(months => v_settings.member_card_validity_months) END,
    member_card_name = COALESCE(NULLIF(BTRIM(v_settings.member_card_name), ''), v_settings.business_name),
    member_card_logo_url = COALESCE(v_settings.member_card_logo_url, v_settings.logo_url),
    member_card_background_url = v_settings.member_card_background_url
  WHERE c.id = p_customer_id AND c.is_active
    AND (c.member_card_token IS NULL OR c.member_card_expires_at <= NOW())
  RETURNING * INTO v_card;
  IF NOT FOUND THEN
    SELECT * INTO v_card FROM public.customers WHERE id = p_customer_id AND is_active;
  END IF;
  IF v_card.id IS NULL OR v_card.member_card_token IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;
  RETURN JSONB_BUILD_OBJECT(
    'token', v_card.member_card_token,
    'expires_at', v_card.member_card_expires_at,
    'name', v_card.full_name,
    'code', v_card.customer_code,
    'phone', v_card.phone,
    'brand', v_card.member_card_name,
    'logo_url', v_card.member_card_logo_url,
    'background_url', v_card.member_card_background_url
  );
END;
$$;

-- The unguessable token is the only public lookup key. Never return phone, email, or loyalty data.
CREATE OR REPLACE FUNCTION public.get_public_member_card(p_token UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT JSONB_BUILD_OBJECT(
    'name', c.full_name,
    'code', c.customer_code,
    'brand', c.member_card_name,
    'logo_url', c.member_card_logo_url,
    'background_url', c.member_card_background_url,
    'issued_at', c.member_card_issued_at,
    'expires_at', c.member_card_expires_at
  )
  FROM public.customers c
  WHERE c.member_card_token = p_token AND c.is_active
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.save_member_card_settings(TEXT, TEXT, TEXT, BOOLEAN, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_member_card(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_member_card(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_member_card_settings(TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_member_card(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_member_card(UUID) TO anon, authenticated;
