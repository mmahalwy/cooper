-- Add persona customization columns to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS persona_name text DEFAULT 'Cooper';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS persona_instructions text DEFAULT '';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS persona_tone text DEFAULT 'professional' CHECK (persona_tone IN ('professional', 'casual', 'concise', 'detailed'));
