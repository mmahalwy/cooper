-- Add branching support to threads
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS parent_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL;
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS branched_at_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX idx_threads_parent ON public.threads(parent_thread_id);
