-- Phase 7: authoritative customer tier configuration boundary
-- Adds the privileged RPC used by Web and Mobile clients.
-- Direct table mutation grants are intentionally retained until both clients
-- migrate from table UPDATE to this RPC.

create or replace function public.save_customer_tier(
  p_tier_id uuid,
  p_name text,
  p_min_spending numeric,
  p_min_visits integer,
  p_discount_percent_service numeric,
  p_discount_percent_product numeric,
  p_points_multiplier numeric,
  p_color_hex text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_caller_profile_id uuid;
  v_code varchar;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null
     or not current_user_has_permission('settings.manage', null)
  then
    raise exception 'Tidak memiliki izin mengelola konfigurasi membership'
      using errcode = '42501';
  end if;

  select id
    into v_caller_profile_id
  from public.profiles
  where auth_user_id = auth.uid()
  limit 1;

  if p_tier_id is null then
    raise exception 'Tier ID wajib ditentukan';
  end if;

  if p_name is null
     or length(trim(p_name)) < 2
     or length(trim(p_name)) > 80
  then
    raise exception 'Nama tingkatan harus 2-80 karakter';
  end if;

  if p_min_spending is null or p_min_spending < 0 then
    raise exception 'Minimum belanja tidak boleh negatif';
  end if;

  if p_min_visits is null or p_min_visits < 0 then
    raise exception 'Minimum kunjungan tidak boleh negatif';
  end if;

  if p_discount_percent_service is null
     or p_discount_percent_service < 0
     or p_discount_percent_service > 100
  then
    raise exception 'Diskon jasa harus berada pada rentang 0-100 persen';
  end if;

  if p_discount_percent_product is null
     or p_discount_percent_product < 0
     or p_discount_percent_product > 100
  then
    raise exception 'Diskon produk harus berada pada rentang 0-100 persen';
  end if;

  if p_points_multiplier is null
     or p_points_multiplier <= 0
     or p_points_multiplier > 100
  then
    raise exception 'Multiplier poin harus lebih besar dari 0 dan maksimal 100x';
  end if;

  if p_color_hex is null
     or trim(p_color_hex) !~ '^#[0-9A-Fa-f]{6}$'
  then
    raise exception 'Warna tier harus berupa HEX 6 digit, contoh #F59E0B';
  end if;

  select code
    into v_code
  from public.customer_tiers
  where id = p_tier_id
  for update;

  if not found then
    raise exception 'Tingkatan membership tidak ditemukan';
  end if;

  select jsonb_build_object(
    'id', id,
    'code', code,
    'name', name,
    'min_spending', min_spending,
    'min_visits', min_visits,
    'discount_percent_service', discount_percent_service,
    'discount_percent_product', discount_percent_product,
    'points_multiplier', points_multiplier,
    'color_hex', color_hex,
    'is_active', is_active
  )
    into v_before
  from public.customer_tiers
  where id = p_tier_id;

  update public.customer_tiers
  set name = trim(p_name),
      min_spending = p_min_spending,
      min_visits = p_min_visits,
      discount_percent_service = p_discount_percent_service,
      discount_percent_product = p_discount_percent_product,
      points_multiplier = p_points_multiplier,
      color_hex = upper(trim(p_color_hex)),
      updated_at = now()
  where id = p_tier_id
  returning jsonb_build_object(
    'id', id,
    'code', code,
    'name', name,
    'min_spending', min_spending,
    'min_visits', min_visits,
    'discount_percent_service', discount_percent_service,
    'discount_percent_product', discount_percent_product,
    'points_multiplier', points_multiplier,
    'color_hex', color_hex,
    'badge_icon', badge_icon,
    'is_active', is_active,
    'updated_at', updated_at
  )
  into v_after;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    before_state,
    after_state,
    reason
  )
  values (
    v_caller_profile_id,
    'UPDATE',
    'CUSTOMER_TIER',
    p_tier_id,
    v_before,
    v_after,
    'Phase 7 membership tier configuration'
  );

  return jsonb_build_object(
    'success', true,
    'tier', v_after
  );
end;
$function$;

revoke execute on function public.save_customer_tier(
  uuid, text, numeric, integer, numeric, numeric, numeric, text
) from anon, public;

grant execute on function public.save_customer_tier(
  uuid, text, numeric, integer, numeric, numeric, numeric, text
) to authenticated;
