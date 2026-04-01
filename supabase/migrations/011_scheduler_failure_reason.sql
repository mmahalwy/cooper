ALTER TABLE public.scheduled_tasks ADD COLUMN IF NOT EXISTS failure_reason text;
