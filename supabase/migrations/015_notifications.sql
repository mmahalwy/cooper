CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id),
  title text NOT NULL,
  body text,
  type text DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() OR (
    user_id IS NULL AND org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid())
  ));

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() OR (
    user_id IS NULL AND org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid())
  ));

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);
