-- Track skill usage for improvement decisions and analytics.
-- usage_count and last_used_at help determine:
-- 1. When a skill has been used enough to warrant improvement
-- 2. Which skills are stale and can be cleaned up

ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- Atomic increment function — safe for concurrent calls
CREATE OR REPLACE FUNCTION public.increment_skill_usage(skill_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.skills
  SET usage_count = usage_count + 1,
      last_used_at = now()
  WHERE id = skill_id;
$$;
