-- Deployed queue/payment relation was missing from tracked migrations.
CREATE TABLE IF NOT EXISTS public.queue_sale_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT queue_sale_links_queue_unique UNIQUE (queue_id),
  CONSTRAINT queue_sale_links_sale_unique UNIQUE (sale_id)
);

ALTER TABLE public.queue_sale_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_sale_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS queue_sale_links_select_authorized ON public.queue_sale_links;
CREATE POLICY queue_sale_links_select_authorized ON public.queue_sale_links
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.queues q
      WHERE q.id = queue_sale_links.queue_id
        AND public.current_user_has_outlet_access(q.outlet_id)
    )
  );

REVOKE ALL ON public.queue_sale_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.queue_sale_links TO authenticated;
GRANT ALL ON public.queue_sale_links TO service_role;
