BEGIN;

CREATE OR REPLACE FUNCTION public.create_customer(
  p_full_name VARCHAR,
  p_phone VARCHAR,
  p_email VARCHAR DEFAULT NULL,
  p_gender VARCHAR DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_tier_id UUID DEFAULT NULL,
  p_preferred_barber_id UUID DEFAULT NULL,
  p_haircut_preferences JSONB DEFAULT '{}'::JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer public.customers%ROWTYPE;
  v_tier_id UUID;
  v_attempt INTEGER := 0;
  v_customer_code VARCHAR(50);
  v_permission_outlet_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT public.is_owner_or_admin() THEN
    SELECT ur.outlet_id
      INTO v_permission_outlet_id
      FROM public.profiles p
      JOIN public.user_roles ur
        ON ur.user_id = p.id
      JOIN public.roles r
        ON r.id = ur.role_id
       AND r.is_active = TRUE
      JOIN public.role_permissions rp
        ON rp.role_id = r.id
      JOIN public.permissions perm
        ON perm.id = rp.permission_id
       AND perm.code IN ('booking.manage', 'pos.sale.create')
     WHERE p.auth_user_id = auth.uid()
       AND p.is_active = TRUE
       AND ur.outlet_id IS NOT NULL
     ORDER BY ur.outlet_id
     LIMIT 1;

    IF v_permission_outlet_id IS NULL
       OR NOT (
         public.current_user_has_permission('booking.manage', v_permission_outlet_id)
         OR public.current_user_has_permission('pos.sale.create', v_permission_outlet_id)
       )
    THEN
      RAISE EXCEPTION 'CUSTOMER_CREATE_FORBIDDEN';
    END IF;
  END IF;

  IF NULLIF(BTRIM(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED';
  END IF;

  IF NULLIF(BTRIM(p_phone), '') IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_PHONE_REQUIRED';
  END IF;

  IF p_tier_id IS NULL THEN
    SELECT ct.id
      INTO v_tier_id
      FROM public.customer_tiers ct
     WHERE ct.code = 'BRONZE'
       AND ct.is_active = TRUE
     ORDER BY ct.min_spending ASC, ct.min_visits ASC, ct.id
     LIMIT 1;
  ELSE
    SELECT ct.id
      INTO v_tier_id
      FROM public.customer_tiers ct
     WHERE ct.id = p_tier_id
       AND ct.is_active = TRUE
     LIMIT 1;

    IF v_tier_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_CUSTOMER_TIER';
    END IF;
  END IF;

  IF p_preferred_barber_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.employees e
       WHERE e.id = p_preferred_barber_id
         AND e.is_active = TRUE
         AND (
           LOWER(COALESCE(e.position, '')) LIKE '%barber%'
           OR LOWER(COALESCE(e.position, '')) LIKE '%kapster%'
         )
    ) THEN
      RAISE EXCEPTION 'INVALID_PREFERRED_BARBER';
    END IF;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_customer_code := 'CUST-' || UPPER(SUBSTR(REPLACE(GEN_RANDOM_UUID()::TEXT, '-', ''), 1, 12));

    BEGIN
      INSERT INTO public.customers (
        customer_code,
        full_name,
        phone,
        email,
        gender,
        date_of_birth,
        tier_id,
        preferred_barber_id,
        haircut_preferences,
        notes,
        is_active
      )
      VALUES (
        v_customer_code,
        BTRIM(p_full_name),
        BTRIM(p_phone),
        NULLIF(BTRIM(p_email), ''),
        NULLIF(BTRIM(p_gender), ''),
        p_date_of_birth,
        v_tier_id,
        p_preferred_barber_id,
        COALESCE(p_haircut_preferences, '{}'::JSONB),
        p_notes,
        TRUE
      )
      RETURNING * INTO v_customer;

      EXIT;
    EXCEPTION
      WHEN UNIQUE_VIOLATION THEN
        IF v_attempt >= 5 THEN
          RAISE EXCEPTION 'CUSTOMER_CODE_ALLOCATION_FAILED';
        END IF;
    END;
  END LOOP;

  RETURN JSONB_BUILD_OBJECT(
    'id', v_customer.id,
    'customer_code', v_customer.customer_code,
    'full_name', v_customer.full_name,
    'phone', v_customer.phone,
    'email', v_customer.email,
    'gender', v_customer.gender,
    'date_of_birth', v_customer.date_of_birth,
    'tier_id', v_customer.tier_id,
    'preferred_barber_id', v_customer.preferred_barber_id,
    'haircut_preferences', v_customer.haircut_preferences,
    'notes', v_customer.notes,
    'is_active', v_customer.is_active,
    'created_at', v_customer.created_at,
    'updated_at', v_customer.updated_at
  );
END;
$$;

COMMIT;
