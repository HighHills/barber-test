-- These tables predate the main RLS migration. Keep reads compatible with the
-- existing expense screen while blocking anonymous and direct client writes.
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;

CREATE POLICY expense_categories_authenticated_read ON public.expense_categories
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY expenses_outlet_read ON public.expenses
  FOR SELECT TO authenticated USING (public.current_user_has_outlet_access(outlet_id));

REVOKE ALL ON public.expense_categories, public.expenses FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.expense_categories, public.expenses FROM authenticated;
GRANT SELECT ON public.expense_categories, public.expenses TO authenticated;
