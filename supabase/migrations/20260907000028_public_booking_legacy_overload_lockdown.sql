-- 20260907000028_public_booking_legacy_overload_lockdown.sql
-- Permanently close the obsolete 7-argument public-booking overload.
--
-- The application currently uses the 9-argument public booking signature.
-- The older 7-argument overload is retained in the schema for compatibility
-- with historical objects, but must not be directly callable by client roles
-- because it is a legacy implementation path.

REVOKE ALL
ON FUNCTION public.create_public_booking(
  UUID,
  UUID,
  UUID,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TEXT
)
FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.create_public_booking(UUID,UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute legacy 7-argument public booking overload';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_public_booking(UUID,UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: authenticated can execute legacy 7-argument public booking overload';
  END IF;

  IF has_function_privilege(
    'service_role',
    'public.create_public_booking(UUID,UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: service_role can execute legacy 7-argument public booking overload';
  END IF;
END;
$$;
