BEGIN;

DROP POLICY IF EXISTS "journal_entries_insert_draft" ON public.journal_entries;

CREATE POLICY "journal_entries_insert_draft"
ON public.journal_entries
FOR INSERT
TO authenticated
WITH CHECK (
  is_owner_or_admin()
  AND status = 'DRAFT'
);

COMMIT;
