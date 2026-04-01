-- Webhooks table for external system integrations
CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  event_types text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_webhooks_org ON public.webhooks(org_id);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org webhooks"
  ON public.webhooks FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Admins can manage webhooks"
  ON public.webhooks FOR ALL
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));
