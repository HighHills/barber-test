BEGIN;

-- Journal header: authenticated clients may only create/edit/delete DRAFT journals.
-- POSTED/REVERSED lifecycle transitions remain backend-RPC controlled.
DROP POLICY IF EXISTS "journal_entries_manage" ON public.journal_entries;

DROP POLICY IF EXISTS "journal_entries_insert_draft" ON public.journal_entries;
CREATE POLICY "journal_entries_insert_draft"
ON public.journal_entries
FOR INSERT
TO authenticated
WITH CHECK (
  is_owner_or_admin()
  AND status = 'DRAFT'
);

DROP POLICY IF EXISTS "journal_entries_update_draft" ON public.journal_entries;
CREATE POLICY "journal_entries_update_draft"
ON public.journal_entries
FOR UPDATE
TO authenticated
USING (
  is_owner_or_admin()
  AND status = 'DRAFT'
)
WITH CHECK (
  is_owner_or_admin()
  AND status = 'DRAFT'
);

DROP POLICY IF EXISTS "journal_entries_delete_draft" ON public.journal_entries;
CREATE POLICY "journal_entries_delete_draft"
ON public.journal_entries
FOR DELETE
TO authenticated
USING (
  is_owner_or_admin()
  AND status = 'DRAFT'
);

-- Journal lines: direct authenticated mutation is limited to DRAFT journals.
-- Require the target parent journal to remain DRAFT on INSERT/UPDATE.
DROP POLICY IF EXISTS "journal_lines_insert" ON public.journal_lines;
CREATE POLICY "journal_lines_insert_draft"
ON public.journal_lines
FOR INSERT
TO authenticated
WITH CHECK (
  is_owner_or_admin()
  AND (outlet_id IS NULL OR current_user_has_outlet_access(outlet_id))
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_entry_id
      AND je.status = 'DRAFT'
  )
);

DROP POLICY IF EXISTS "journal_lines_update" ON public.journal_lines;
CREATE POLICY "journal_lines_update_draft"
ON public.journal_lines
FOR UPDATE
TO authenticated
USING (
  is_owner_or_admin()
  AND (outlet_id IS NULL OR current_user_has_outlet_access(outlet_id))
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_entry_id
      AND je.status = 'DRAFT'
  )
)
WITH CHECK (
  is_owner_or_admin()
  AND (outlet_id IS NULL OR current_user_has_outlet_access(outlet_id))
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_entry_id
      AND je.status = 'DRAFT'
  )
);

DROP POLICY IF EXISTS "journal_lines_delete" ON public.journal_lines;
CREATE POLICY "journal_lines_delete_draft"
ON public.journal_lines
FOR DELETE
TO authenticated
USING (
  is_owner_or_admin()
  AND EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_entry_id
      AND je.status = 'DRAFT'
  )
);

COMMIT;
