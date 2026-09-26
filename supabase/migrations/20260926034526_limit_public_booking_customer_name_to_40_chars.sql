-- Limit public booking customer names to 40 characters.
-- The anonymous booking RPC delegates validation to the hardened legacy implementation.
-- Replace only the existing 9-argument implementation so the public API remains unchanged.

do $$
declare
  v_sql text;
begin
  select pg_get_functiondef(p.oid)
    into v_sql
  from pg_proc p
  where p.oid = 'public._legacy_create_public_booking(uuid,uuid,date,time without time zone,character varying,character varying,uuid,character varying,text)'::regprocedure;

  if v_sql is null then
    raise exception 'Target public booking function was not found';
  end if;

  v_sql := replace(v_sql, 'length(v_name) > 100', 'length(v_name) > 40');
  v_sql := replace(v_sql, 'Nama pelanggan harus 2-100 karakter', 'Nama pelanggan harus 2-40 karakter');

  execute v_sql;
end
$$;
