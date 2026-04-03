-- Track where a conversation originated
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web'
  CHECK (source IN ('web', 'slack', 'scheduler', 'api'));
