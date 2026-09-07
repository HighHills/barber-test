-- 20260907000027_public_booking_queue_race_hardening.sql
-- Serialize public-booking queue-number allocation per outlet/date.
--
-- Finding:
--   The current public booking implementation allocates today's queue number
--   using MAX(queue_number) + 1. Concurrent anonymous bookings can observe
--   the same MAX() and race to insert the same queue number.
--
-- Approach:
--   * Rename the current 9-argument implementation to an internal legacy name.
--   * Keep the public signature unchanged for application compatibility.
--   * Acquire a transaction-scoped advisory lock keyed by outlet + booking date
--     before invoking the existing business body.
--   * Close direct client execution of the renamed implementation.
--
-- This does not change the business result for normal callers; it only
-- serializes the critical section that calculates queue_number.

-- ============================================================================
-- 1. RENAME CURRENT PUBLIC IMPLEMENTATION
-- ============================================================================
ALTER FUNCTION create_public_booking(
  UUID,
  UUID,
  DATE,
  TIME,
  VARCHAR,
  VARCHAR,
  UUID,
  VARCHAR,
  TEXT
)
  RENAME TO _legacy_create_public_booking;

REVOKE ALL ON FUNCTION _legacy_create_public_booking(
  UUID,
  UUID,
  DATE,
  TIME,
  VARCHAR,
  VARCHAR,
  UUID,
  VARCHAR,
  TEXT
) FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 2. SECURE WRAPPER WITH QUEUE ALLOCATION LOCK
-- ============================================================================
CREATE OR REPLACE FUNCTION create_public_booking(
  p_outlet_id UUID,
  p_service_id UUID,
  p_booking_date DATE,
  p_booking_time TIME,
  p_customer_name VARCHAR,
  p_customer_phone VARCHAR,
  p_barber_id UUID DEFAULT NULL,
  p_customer_email VARCHAR DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Serialize queue-number allocation for this outlet/date.
  -- hashtextextended() gives a stable bigint key for pg_advisory_xact_lock().
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'public-booking-queue:' || p_outlet_id::TEXT || ':' || p_booking_date::TEXT,
      0
    )
  );

  RETURN _legacy_create_public_booking(
    p_outlet_id,
    p_service_id,
    p_booking_date,
    p_booking_time,
    p_customer_name,
    p_customer_phone,
    p_barber_id,
    p_customer_email,
    p_notes
  );
END;
$$;

-- The public booking endpoint remains intentionally anonymous.
REVOKE EXECUTE ON FUNCTION create_public_booking(
  UUID,
  UUID,
  DATE,
  TIME,
  VARCHAR,
  VARCHAR,
  UUID,
  VARCHAR,
  TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_public_booking(
  UUID,
  UUID,
  DATE,
  TIME,
  VARCHAR,
  VARCHAR,
  UUID,
  VARCHAR,
  TEXT
) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. ASSERTIONS
-- ============================================================================
DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    '_legacy_create_public_booking(UUID,UUID,DATE,TIME,VARCHAR,VARCHAR,UUID,VARCHAR,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon can execute legacy public booking body';
  END IF;

  IF NOT has_function_privilege(
    'anon',
    'create_public_booking(UUID,UUID,DATE,TIME,VARCHAR,VARCHAR,UUID,VARCHAR,TEXT)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Security assertion failed: anon cannot execute public booking wrapper';
  END IF;
END;
$$;
