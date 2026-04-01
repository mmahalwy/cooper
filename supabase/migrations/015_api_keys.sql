CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_api_keys_org ON public.api_keys(org_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org API keys"
  ON public.api_keys FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Admins can create API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete API keys"
  ON public.api_keys FOR DELETE
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid() AND role = 'admin'));
