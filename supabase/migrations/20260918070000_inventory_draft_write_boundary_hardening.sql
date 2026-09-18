-- ============================================================================
-- MIGRATION: INVENTORY DRAFT WRITE BOUNDARY HARDENING
-- Phase 3G
--
-- Objectives:
--   1. Keep inventory adjustment/transfer draft workflows direct but authorized.
--   2. Prevent direct table DML from creating non-draft/final states.
--   3. Require inventory.adjust / inventory.transfer permission.
--   4. Bind newly created drafts to the current profile.
--   5. Prevent invalid negative quantities/costs.
--   6. Prevent duplicate products within one draft document.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.stock_adjustment_items'::regclass
      AND conname='stock_adjustment_items_quantity_before_nonnegative'
  ) THEN
    ALTER TABLE public.stock_adjustment_items
      ADD CONSTRAINT stock_adjustment_items_quantity_before_nonnegative
      CHECK (quantity_before >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.stock_adjustment_items'::regclass
      AND conname='stock_adjustment_items_quantity_after_nonnegative'
  ) THEN
    ALTER TABLE public.stock_adjustment_items
      ADD CONSTRAINT stock_adjustment_items_quantity_after_nonnegative
      CHECK (quantity_after >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.stock_adjustment_items'::regclass
      AND conname='stock_adjustment_items_unit_cost_nonnegative'
  ) THEN
    ALTER TABLE public.stock_adjustment_items
      ADD CONSTRAINT stock_adjustment_items_unit_cost_nonnegative
      CHECK (unit_cost >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.stock_transfer_items'::regclass
      AND conname='stock_transfer_items_quantity_positive'
  ) THEN
    ALTER TABLE public.stock_transfer_items
      ADD CONSTRAINT stock_transfer_items_quantity_positive
      CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.stock_transfer_items'::regclass
      AND conname='stock_transfer_items_unit_cost_nonnegative'
  ) THEN
    ALTER TABLE public.stock_transfer_items
      ADD CONSTRAINT stock_transfer_items_unit_cost_nonnegative
      CHECK (unit_cost >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_adjustment_items_product
  ON public.stock_adjustment_items(adjustment_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_transfer_items_product
  ON public.stock_transfer_items(transfer_id, product_id);

DROP POLICY IF EXISTS stock_adjustments_insert ON public.stock_adjustments;
CREATE POLICY stock_adjustments_insert
  ON public.stock_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'DRAFT'
    AND current_user_has_permission('inventory.adjust', outlet_id)
    AND created_by = get_current_profile_id()
  );

DROP POLICY IF EXISTS stock_adjustments_update ON public.stock_adjustments;
CREATE POLICY stock_adjustments_update
  ON public.stock_adjustments
  FOR UPDATE TO authenticated
  USING (
    status = 'DRAFT'
    AND current_user_has_permission('inventory.adjust', outlet_id)
  )
  WITH CHECK (
    status = 'DRAFT'
    AND current_user_has_permission('inventory.adjust', outlet_id)
    AND created_by = get_current_profile_id()
  );

DROP POLICY IF EXISTS stock_adjustments_delete ON public.stock_adjustments;
CREATE POLICY stock_adjustments_delete
  ON public.stock_adjustments
  FOR DELETE TO authenticated
  USING (
    status = 'DRAFT'
    AND current_user_has_permission('inventory.adjust', outlet_id)
  );

DROP POLICY IF EXISTS stock_adjustment_items_insert ON public.stock_adjustment_items;
CREATE POLICY stock_adjustment_items_insert
  ON public.stock_adjustment_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_adjustments sa
      WHERE sa.id = stock_adjustment_items.adjustment_id
        AND sa.status = 'DRAFT'
        AND current_user_has_permission('inventory.adjust', sa.outlet_id)
    )
  );

DROP POLICY IF EXISTS stock_adjustment_items_update ON public.stock_adjustment_items;
CREATE POLICY stock_adjustment_items_update
  ON public.stock_adjustment_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stock_adjustments sa
      WHERE sa.id = stock_adjustment_items.adjustment_id
        AND sa.status = 'DRAFT'
        AND current_user_has_permission('inventory.adjust', sa.outlet_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_adjustments sa
      WHERE sa.id = stock_adjustment_items.adjustment_id
        AND sa.status = 'DRAFT'
        AND current_user_has_permission('inventory.adjust', sa.outlet_id)
    )
  );

DROP POLICY IF EXISTS stock_adjustment_items_delete ON public.stock_adjustment_items;
CREATE POLICY stock_adjustment_items_delete
  ON public.stock_adjustment_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stock_adjustments sa
      WHERE sa.id = stock_adjustment_items.adjustment_id
        AND sa.status = 'DRAFT'
        AND current_user_has_permission('inventory.adjust', sa.outlet_id)
    )
  );

DROP POLICY IF EXISTS stock_transfers_insert ON public.stock_transfers;
CREATE POLICY stock_transfers_insert
  ON public.stock_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'REQUESTED'
    AND from_outlet_id <> to_outlet_id
    AND current_user_has_permission('inventory.transfer', from_outlet_id)
    AND (is_owner_or_admin() OR current_user_has_outlet_access(to_outlet_id))
    AND requested_by = get_current_profile_id()
  );

DROP POLICY IF EXISTS stock_transfers_update ON public.stock_transfers;
CREATE POLICY stock_transfers_update
  ON public.stock_transfers
  FOR UPDATE TO authenticated
  USING (
    status = 'REQUESTED'
    AND current_user_has_permission('inventory.transfer', from_outlet_id)
  )
  WITH CHECK (
    status = 'REQUESTED'
    AND from_outlet_id <> to_outlet_id
    AND current_user_has_permission('inventory.transfer', from_outlet_id)
    AND (is_owner_or_admin() OR current_user_has_outlet_access(to_outlet_id))
    AND requested_by = get_current_profile_id()
  );

DROP POLICY IF EXISTS stock_transfers_delete ON public.stock_transfers;
CREATE POLICY stock_transfers_delete
  ON public.stock_transfers
  FOR DELETE TO authenticated
  USING (
    status = 'REQUESTED'
    AND current_user_has_permission('inventory.transfer', from_outlet_id)
  );

DROP POLICY IF EXISTS stock_transfer_items_insert ON public.stock_transfer_items;
CREATE POLICY stock_transfer_items_insert
  ON public.stock_transfer_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.status = 'REQUESTED'
        AND current_user_has_permission('inventory.transfer', st.from_outlet_id)
    )
  );

DROP POLICY IF EXISTS stock_transfer_items_update ON public.stock_transfer_items;
CREATE POLICY stock_transfer_items_update
  ON public.stock_transfer_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.status = 'REQUESTED'
        AND current_user_has_permission('inventory.transfer', st.from_outlet_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.status = 'REQUESTED'
        AND current_user_has_permission('inventory.transfer', st.from_outlet_id)
    )
  );

DROP POLICY IF EXISTS stock_transfer_items_delete ON public.stock_transfer_items;
CREATE POLICY stock_transfer_items_delete
  ON public.stock_transfer_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.stock_transfers st
      WHERE st.id = stock_transfer_items.transfer_id
        AND st.status = 'REQUESTED'
        AND current_user_has_permission('inventory.transfer', st.from_outlet_id)
    )
  );
