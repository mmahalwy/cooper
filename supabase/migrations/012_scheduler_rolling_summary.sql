ALTER TABLE public.scheduled_tasks ADD COLUMN IF NOT EXISTS rolling_summary text;
