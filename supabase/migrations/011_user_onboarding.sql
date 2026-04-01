-- Add onboarding tracking to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz DEFAULT NULL;
