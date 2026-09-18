-- ============================================================================
-- MIGRATION: COMMISSION RULE MUTATION RPC BOUNDARY HARDENING
-- Phase 3H
--
-- Objectives:
--   * Make commission rule mutations server-authoritative.
--   * Enforce commission.manage authorization.
--   * Validate related master-data references and outlet scope.
--   * Reject duplicate active semantic rules.
--   * Preserve read-only access for application clients.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_commission_rule(
  p_rule_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_outlet_id uuid DEFAULT NULL,
  p_commission_type public.commission_type_enum DEFAULT 'PERCENTAGE'::public.commission_type_enum,
  p_commission_rate numeric DEFAULT NULL,
  p_fixed_amount numeric DEFAULT NULL,
  p_effective_from date DEFAULT CURRENT_DATE,
  p_effective_until date DEFAULT NULL,
  p_priority integer DEFAULT 8,
  p_is_active boolean DEFAULT TRUE,
  p_tier_config jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid;
  v_rule public.commission_rules%rowtype;
  v_existing public.commission_rules%rowtype;
  v_is_update boolean := p_rule_id IS NOT NULL;
BEGIN
  v_actor := public._security_current_actor_profile(NULL);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_PROFILE_REQUIRED' USING ERRCODE='42501';
  END IF;

  IF p_service_id IS NOT NULL AND p_product_id IS NOT NULL THEN
    RAISE EXCEPTION 'COMMISSION_RULE_TARGET_CONFLICT' USING ERRCODE='22023';
  END IF;

  IF p_priority IS NULL OR p_priority NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'COMMISSION_RULE_PRIORITY_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'COMMISSION_RULE_EFFECTIVE_FROM_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF p_effective_until IS NOT NULL AND p_effective_until < p_effective_from THEN
    RAISE EXCEPTION 'COMMISSION_RULE_EFFECTIVE_DATE_INVALID' USING ERRCODE='22023';
  END IF;

  IF p_commission_type = 'PERCENTAGE'::public.commission_type_enum THEN
    IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 100 THEN
      RAISE EXCEPTION 'COMMISSION_RULE_PERCENTAGE_INVALID' USING ERRCODE='22023';
    END IF;
    IF p_fixed_amount IS NOT NULL AND p_fixed_amount <> 0 THEN
      RAISE EXCEPTION 'COMMISSION_RULE_PERCENTAGE_FIXED_AMOUNT_CONFLICT' USING ERRCODE='22023';
    END IF;
  ELSIF p_commission_type = 'FIXED'::public.commission_type_enum THEN
    IF p_fixed_amount IS NULL OR p_fixed_amount < 0 THEN
      RAISE EXCEPTION 'COMMISSION_RULE_FIXED_AMOUNT_INVALID' USING ERRCODE='22023';
    END IF;
    IF p_commission_rate IS NOT NULL AND p_commission_rate <> 0 THEN
      RAISE EXCEPTION 'COMMISSION_RULE_FIXED_RATE_CONFLICT' USING ERRCODE='22023';
    END IF;
  ELSIF p_commission_type = 'TIERED'::public.commission_type_enum THEN
    IF p_tier_config IS NULL
       OR jsonb_typeof(p_tier_config) <> 'array'
       OR jsonb_array_length(p_tier_config) = 0 THEN
      RAISE EXCEPTION 'COMMISSION_RULE_TIER_CONFIG_REQUIRED' USING ERRCODE='22023';
    END IF;
  END IF;

  IF p_outlet_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.outlets o
       WHERE o.id=p_outlet_id
         AND o.is_active=TRUE
     )
  THEN
    RAISE EXCEPTION 'COMMISSION_RULE_OUTLET_INVALID' USING ERRCODE='22023';
  END IF;

  IF NOT public.current_user_has_permission('commission.manage', p_outlet_id) THEN
    RAISE EXCEPTION 'COMMISSION_RULE_PERMISSION_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF p_employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id=p_employee_id
        AND e.is_active=TRUE
    ) THEN
      RAISE EXCEPTION 'COMMISSION_RULE_EMPLOYEE_INVALID' USING ERRCODE='22023';
    END IF;

    IF p_outlet_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.employee_outlets eo
         WHERE eo.employee_id=p_employee_id
           AND eo.outlet_id=p_outlet_id
           AND eo.is_active=TRUE
       )
    THEN
      RAISE EXCEPTION 'COMMISSION_RULE_EMPLOYEE_OUTLET_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;

  IF p_service_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id=p_service_id
        AND s.is_active=TRUE
    ) THEN
      RAISE EXCEPTION 'COMMISSION_RULE_SERVICE_INVALID' USING ERRCODE='22023';
    END IF;

    IF p_outlet_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.service_outlets so
         WHERE so.service_id=p_service_id
           AND so.outlet_id=p_outlet_id
           AND so.is_active=TRUE
       )
    THEN
      RAISE EXCEPTION 'COMMISSION_RULE_SERVICE_OUTLET_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;

  IF p_product_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.products pr
      WHERE pr.id=p_product_id
        AND pr.is_active=TRUE
    ) THEN
      RAISE EXCEPTION 'COMMISSION_RULE_PRODUCT_INVALID' USING ERRCODE='22023';
    END IF;

    IF p_outlet_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.product_outlets po
         WHERE po.product_id=p_product_id
           AND po.outlet_id=p_outlet_id
           AND po.is_active=TRUE
       )
    THEN
      RAISE EXCEPTION 'COMMISSION_RULE_PRODUCT_OUTLET_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;

  IF v_is_update THEN
    SELECT *
      INTO v_rule
      FROM public.commission_rules
     WHERE id=p_rule_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COMMISSION_RULE_NOT_FOUND' USING ERRCODE='P0002';
    END IF;

    IF NOT public.current_user_has_permission('commission.manage', v_rule.outlet_id) THEN
      RAISE EXCEPTION 'COMMISSION_RULE_EXISTING_SCOPE_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_is_active THEN
    SELECT *
      INTO v_existing
      FROM public.commission_rules cr
     WHERE cr.id IS DISTINCT FROM p_rule_id
       AND cr.is_active=TRUE
       AND cr.employee_id IS NOT DISTINCT FROM p_employee_id
       AND cr.service_id IS NOT DISTINCT FROM p_service_id
       AND cr.product_id IS NOT DISTINCT FROM p_product_id
       AND cr.outlet_id IS NOT DISTINCT FROM p_outlet_id
       AND cr.commission_type=p_commission_type
       AND cr.commission_rate IS NOT DISTINCT FROM p_commission_rate
       AND cr.fixed_amount IS NOT DISTINCT FROM p_fixed_amount
       AND cr.effective_from=p_effective_from
       AND cr.effective_until IS NOT DISTINCT FROM p_effective_until
       AND cr.priority=p_priority
       AND cr.tier_config IS NOT DISTINCT FROM p_tier_config
     LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'COMMISSION_RULE_DUPLICATE' USING ERRCODE='23505';
    END IF;
  END IF;

  IF v_is_update THEN
    UPDATE public.commission_rules
       SET employee_id=p_employee_id,
           service_id=p_service_id,
           product_id=p_product_id,
           outlet_id=p_outlet_id,
           commission_type=p_commission_type,
           commission_rate=CASE
             WHEN p_commission_type='PERCENTAGE'::public.commission_type_enum THEN p_commission_rate
             ELSE NULL
           END,
           fixed_amount=CASE
             WHEN p_commission_type='FIXED'::public.commission_type_enum THEN p_fixed_amount
             ELSE NULL
           END,
           effective_from=p_effective_from,
           effective_until=p_effective_until,
           priority=p_priority,
           is_active=p_is_active,
           tier_config=CASE
             WHEN p_commission_type='TIERED'::public.commission_type_enum THEN p_tier_config
             ELSE NULL
           END,
           updated_at=CURRENT_TIMESTAMP
     WHERE id=p_rule_id
    RETURNING * INTO v_rule;
  ELSE
    INSERT INTO public.commission_rules (
      employee_id, service_id, product_id, outlet_id,
      commission_type, commission_rate, fixed_amount,
      effective_from, effective_until, priority, is_active, tier_config
    )
    VALUES (
      p_employee_id,
      p_service_id,
      p_product_id,
      p_outlet_id,
      p_commission_type,
      CASE WHEN p_commission_type='PERCENTAGE'::public.commission_type_enum THEN p_commission_rate ELSE NULL END,
      CASE WHEN p_commission_type='FIXED'::public.commission_type_enum THEN p_fixed_amount ELSE NULL END,
      p_effective_from,
      p_effective_until,
      p_priority,
      p_is_active,
      CASE WHEN p_commission_type='TIERED'::public.commission_type_enum THEN p_tier_config ELSE NULL END
    )
    RETURNING * INTO v_rule;
  END IF;

  RETURN jsonb_build_object(
    'id', v_rule.id,
    'employee_id', v_rule.employee_id,
    'service_id', v_rule.service_id,
    'product_id', v_rule.product_id,
    'outlet_id', v_rule.outlet_id,
    'commission_type', v_rule.commission_type,
    'commission_rate', v_rule.commission_rate,
    'fixed_amount', v_rule.fixed_amount,
    'effective_from', v_rule.effective_from,
    'effective_until', v_rule.effective_until,
    'priority', v_rule.priority,
    'is_active', v_rule.is_active,
    'tier_config', v_rule.tier_config,
    'created_at', v_rule.created_at,
    'updated_at', v_rule.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_commission_rule_active(
  p_rule_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rule public.commission_rules%rowtype;
BEGIN
  PERFORM public._security_current_actor_profile(NULL);

  SELECT *
    INTO v_rule
    FROM public.commission_rules
   WHERE id=p_rule_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMISSION_RULE_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  IF NOT public.current_user_has_permission('commission.manage', v_rule.outlet_id) THEN
    RAISE EXCEPTION 'COMMISSION_RULE_PERMISSION_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  IF p_is_active AND EXISTS (
    SELECT 1
    FROM public.commission_rules cr
    WHERE cr.id<>p_rule_id
      AND cr.is_active=TRUE
      AND cr.employee_id IS NOT DISTINCT FROM v_rule.employee_id
      AND cr.service_id IS NOT DISTINCT FROM v_rule.service_id
      AND cr.product_id IS NOT DISTINCT FROM v_rule.product_id
      AND cr.outlet_id IS NOT DISTINCT FROM v_rule.outlet_id
      AND cr.commission_type=v_rule.commission_type
      AND cr.commission_rate IS NOT DISTINCT FROM v_rule.commission_rate
      AND cr.fixed_amount IS NOT DISTINCT FROM v_rule.fixed_amount
      AND cr.effective_from=v_rule.effective_from
      AND cr.effective_until IS NOT DISTINCT FROM v_rule.effective_until
      AND cr.priority=v_rule.priority
      AND cr.tier_config IS NOT DISTINCT FROM v_rule.tier_config
  ) THEN
    RAISE EXCEPTION 'COMMISSION_RULE_DUPLICATE' USING ERRCODE='23505';
  END IF;

  UPDATE public.commission_rules
     SET is_active=p_is_active,
         updated_at=CURRENT_TIMESTAMP
   WHERE id=p_rule_id
  RETURNING * INTO v_rule;

  RETURN jsonb_build_object(
    'id', v_rule.id,
    'is_active', v_rule.is_active,
    'updated_at', v_rule.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_commission_rule(p_rule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rule public.commission_rules%rowtype;
BEGIN
  PERFORM public._security_current_actor_profile(NULL);

  SELECT *
    INTO v_rule
    FROM public.commission_rules
   WHERE id=p_rule_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMISSION_RULE_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  IF NOT public.current_user_has_permission('commission.manage', v_rule.outlet_id) THEN
    RAISE EXCEPTION 'COMMISSION_RULE_PERMISSION_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  DELETE FROM public.commission_rules
   WHERE id=p_rule_id;

  RETURN jsonb_build_object('success', true, 'deleted_id', p_rule_id);
END;
$function$;

REVOKE INSERT, UPDATE, DELETE ON public.commission_rules FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.commission_rules FROM anon;

REVOKE ALL ON FUNCTION public.save_commission_rule(
  uuid,uuid,uuid,uuid,uuid,public.commission_type_enum,numeric,numeric,date,date,integer,boolean,jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_commission_rule(
  uuid,uuid,uuid,uuid,uuid,public.commission_type_enum,numeric,numeric,date,date,integer,boolean,jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_commission_rule_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_commission_rule_active(uuid,boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_commission_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_commission_rule(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.commission_rules IS
  'Commission rules. Client mutation occurs only through save_commission_rule, set_commission_rule_active, and delete_commission_rule RPCs.';
