ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;
CREATE INDEX idx_threads_pinned ON public.threads(pinned DESC, updated_at DESC);

-- Allow users to delete their own threads
CREATE POLICY "Users can delete own threads"
  ON public.threads FOR DELETE
  USING (user_id = auth.uid());

-- Allow deleting messages in deleted threads
CREATE POLICY "Users can delete messages in own threads"
  ON public.messages FOR DELETE
  USING (thread_id IN (
    SELECT id FROM public.threads WHERE user_id = auth.uid()
  ));
