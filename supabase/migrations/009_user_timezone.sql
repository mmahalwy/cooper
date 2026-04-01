-- Add timezone column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Los_Angeles';
