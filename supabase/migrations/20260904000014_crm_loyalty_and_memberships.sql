-- ==============================================================================
-- BARBERSHOP OS - MIGRATION 14: CRM PELANGGAN, MEMBERSHIP & POIN LOYALITAS
-- ==============================================================================

-- 1. Tabel Tingkatan Membership (Customer Tiers)
CREATE TABLE IF NOT EXISTS customer_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  min_spending NUMERIC(18,2) NOT NULL DEFAULT 0,
  min_visits INT NOT NULL DEFAULT 0,
  discount_percent_service NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_percent_product NUMERIC(5,2) NOT NULL DEFAULT 0,
  points_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  color_hex VARCHAR(20) NOT NULL DEFAULT '#64748b',
  badge_icon VARCHAR(50) DEFAULT 'Award',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial 4 Tiers
INSERT INTO customer_tiers (code, name, min_spending, min_visits, discount_percent_service, discount_percent_product, points_multiplier, color_hex, badge_icon)
VALUES
  ('BRONZE', 'Bronze Member', 0, 0, 0, 0, 1.0, '#94a3b8', 'Award'),
  ('SILVER', 'Silver VIP', 300000, 5, 5.0, 0, 1.2, '#38bdf8', 'Shield'),
  ('GOLD', 'Gold Executive', 1000000, 15, 10.0, 5.0, 1.5, '#f59e0b', 'Crown'),
  ('PLATINUM', 'Platinum Royal', 2500000, 30, 15.0, 10.0, 2.0, '#8b5cf6', 'Sparkles')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  min_spending = EXCLUDED.min_spending,
  min_visits = EXCLUDED.min_visits,
  discount_percent_service = EXCLUDED.discount_percent_service,
  discount_percent_product = EXCLUDED.discount_percent_product,
  points_multiplier = EXCLUDED.points_multiplier,
  color_hex = EXCLUDED.color_hex;

-- 2. Tambah Kolom CRM & Loyalitas pada Tabel customers
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'tier_id') THEN
    ALTER TABLE customers ADD COLUMN tier_id UUID REFERENCES customer_tiers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'current_loyalty_points') THEN
    ALTER TABLE customers ADD COLUMN current_loyalty_points INT NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'lifetime_loyalty_points') THEN
    ALTER TABLE customers ADD COLUMN lifetime_loyalty_points INT NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'preferred_barber_id') THEN
    ALTER TABLE customers ADD COLUMN preferred_barber_id UUID REFERENCES employees(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'haircut_preferences') THEN
    ALTER TABLE customers ADD COLUMN haircut_preferences JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Pastikan seluruh pelanggan existing terhubung ke tier BRONZE jika belum memiliki tier
UPDATE customers
SET tier_id = (SELECT id FROM customer_tiers WHERE code = 'BRONZE' LIMIT 1)
WHERE tier_id IS NULL;

-- 3. Tabel Buku Besar Poin Loyalitas (Customer Loyalty Ledger)
CREATE TABLE IF NOT EXISTS customer_loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('EARN', 'REDEEM', 'MANUAL_ADJUSTMENT', 'BONUS')),
  points_change INT NOT NULL,
  points_balance_after INT NOT NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON customer_loyalty_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_created ON customer_loyalty_ledger(created_at DESC);

-- 4. Tabel Riwayat Gaya Pangkas Rambut (Haircut History)
CREATE TABLE IF NOT EXISTS customer_haircut_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE RESTRICT,
  barber_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  style_name VARCHAR(150) NOT NULL,
  clipper_guard_sides VARCHAR(50),
  clipper_guard_top VARCHAR(50),
  styling_product_used VARCHAR(150),
  special_notes TEXT,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_haircut_history_customer ON customer_haircut_history(customer_id);

-- 5. Fungsi Rekalkulasi Tier Pelanggan (Recalculate Customer Tier)
CREATE OR REPLACE FUNCTION recalculate_customer_tier(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_spending NUMERIC(18,2) := 0;
  v_total_visits INT := 0;
  v_new_tier_id UUID;
BEGIN
  -- Hitung total belanja dari transaksi penjualan selesai
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(id)
  INTO v_total_spending, v_total_visits
  FROM sales
  WHERE customer_id = p_customer_id AND status = 'COMPLETED';

  -- Cari tier tertinggi yang memenuhi syarat belanja ATAU syarat kunjungan
  SELECT id INTO v_new_tier_id
  FROM customer_tiers
  WHERE is_active = TRUE 
    AND (v_total_spending >= min_spending OR v_total_visits >= min_visits)
  ORDER BY min_spending DESC, min_visits DESC
  LIMIT 1;

  IF v_new_tier_id IS NOT NULL THEN
    UPDATE customers
    SET tier_id = v_new_tier_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;
  END IF;
END;
$$;

-- 6. Fungsi Poin Loyalitas (Award Points & Redeem Points)
CREATE OR REPLACE FUNCTION award_loyalty_points(
  p_customer_id UUID,
  p_outlet_id UUID,
  p_sale_id UUID,
  p_net_spending NUMERIC,
  p_created_by UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_multiplier NUMERIC(4,2) := 1.0;
  v_points_earned INT := 0;
  v_current_balance INT := 0;
  v_new_balance INT := 0;
BEGIN
  -- Dapatkan multiplier dari tier pelanggan
  SELECT COALESCE(ct.points_multiplier, 1.0), c.current_loyalty_points
  INTO v_multiplier, v_current_balance
  FROM customers c
  LEFT JOIN customer_tiers ct ON ct.id = c.tier_id
  WHERE c.id = p_customer_id;

  -- 1 Poin per Rp 10.000 belanja dikalikan tier multiplier
  v_points_earned := FLOOR((p_net_spending / 10000.0) * v_multiplier);

  IF v_points_earned > 0 THEN
    v_new_balance := v_current_balance + v_points_earned;

    -- Update tabel customers
    UPDATE customers
    SET current_loyalty_points = v_new_balance,
        lifetime_loyalty_points = lifetime_loyalty_points + v_points_earned,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;

    -- Catat ke ledger
    INSERT INTO customer_loyalty_ledger (
      customer_id, outlet_id, transaction_type, points_change,
      points_balance_after, sale_id, notes, created_by
    ) VALUES (
      p_customer_id, p_outlet_id, 'EARN', v_points_earned,
      v_new_balance, p_sale_id, 'Poin transaksi belanja POS', p_created_by
    );
  END IF;

  -- Evaluasi kenaikan tier
  PERFORM recalculate_customer_tier(p_customer_id);

  RETURN v_points_earned;
END;
$$;

-- 7. Helper Security Function & Row Level Security (RLS) Policies
CREATE OR REPLACE FUNCTION is_owner_or_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN profiles p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.code IN ('OWNER', 'ADMIN')
      AND r.is_active = TRUE
      AND p.is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

ALTER TABLE customer_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tiers FORCE ROW LEVEL SECURITY;

ALTER TABLE customer_loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty_ledger FORCE ROW LEVEL SECURITY;

ALTER TABLE customer_haircut_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_haircut_history FORCE ROW LEVEL SECURITY;

-- Policies customer_tiers: Semua staf terotentikasi bisa baca, owner/admin yang bisa edit
DROP POLICY IF EXISTS "customer_tiers_select" ON customer_tiers;
CREATE POLICY "customer_tiers_select" ON customer_tiers FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "customer_tiers_all" ON customer_tiers;
CREATE POLICY "customer_tiers_all" ON customer_tiers FOR ALL USING (is_owner_or_admin());

-- Policies customer_loyalty_ledger: Staf terotentikasi bisa baca & insert
DROP POLICY IF EXISTS "loyalty_ledger_select" ON customer_loyalty_ledger;
CREATE POLICY "loyalty_ledger_select" ON customer_loyalty_ledger FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "loyalty_ledger_insert" ON customer_loyalty_ledger;
CREATE POLICY "loyalty_ledger_insert" ON customer_loyalty_ledger FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Policies customer_haircut_history: Staf terotentikasi bisa baca, insert, update
DROP POLICY IF EXISTS "haircut_history_select" ON customer_haircut_history;
CREATE POLICY "haircut_history_select" ON customer_haircut_history FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "haircut_history_insert" ON customer_haircut_history;
CREATE POLICY "haircut_history_insert" ON customer_haircut_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "haircut_history_update" ON customer_haircut_history;
CREATE POLICY "haircut_history_update" ON customer_haircut_history FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 8. GRANT Permissions
GRANT SELECT ON customer_tiers TO authenticated;
GRANT ALL ON customer_tiers TO service_role;

GRANT SELECT, INSERT ON customer_loyalty_ledger TO authenticated;
GRANT ALL ON customer_loyalty_ledger TO service_role;

GRANT SELECT, INSERT, UPDATE ON customer_haircut_history TO authenticated;
GRANT ALL ON customer_haircut_history TO service_role;
