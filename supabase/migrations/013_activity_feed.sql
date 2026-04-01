-- Activity feed for tracking Cooper's actions
CREATE TABLE public.activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id),
  action text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_activity_org ON public.activity(org_id, created_at DESC);
CREATE INDEX idx_activity_thread ON public.activity(thread_id);

ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org activity"
  ON public.activity FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "System can insert activity"
  ON public.activity FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid()));
