CREATE TABLE public.message_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  rating text NOT NULL CHECK (rating IN ('positive', 'negative')),
  comment text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_feedback_message ON public.message_feedback(message_id);

ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON public.message_feedback FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can give feedback"
  ON public.message_feedback FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own feedback"
  ON public.message_feedback FOR UPDATE
  USING (user_id = auth.uid());
