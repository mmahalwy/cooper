-- Add locking and failure tracking for scheduler reliability
ALTER TABLE public.scheduled_tasks ADD COLUMN locked_until timestamptz;
ALTER TABLE public.scheduled_tasks ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;
CREATE INDEX idx_scheduled_tasks_locked ON public.scheduled_tasks(locked_until) WHERE status = 'active';
