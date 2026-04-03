-- Add user ownership and scope to connections
ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'shared' CHECK (scope IN ('personal', 'shared')),
  ADD COLUMN IF NOT EXISTS composio_entity_id text;

CREATE INDEX IF NOT EXISTS idx_connections_user_id ON public.connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_scope ON public.connections(scope);

-- Backfill: assign existing connections to org admin
UPDATE public.connections c
SET user_id = (
  SELECT u.id FROM public.users u
  WHERE u.org_id = c.org_id AND u.role = 'admin'
  LIMIT 1
),
composio_entity_id = (
  SELECT u.id::text FROM public.users u
  WHERE u.org_id = c.org_id AND u.role = 'admin'
  LIMIT 1
)
WHERE c.user_id IS NULL;

-- Replace RLS policies
DROP POLICY IF EXISTS "Users can view own org connections" ON public.connections;
DROP POLICY IF EXISTS "Users can create connections in own org" ON public.connections;
DROP POLICY IF EXISTS "Users can update own org connections" ON public.connections;
DROP POLICY IF EXISTS "Users can delete own org connections" ON public.connections;

CREATE POLICY "Users can view accessible connections" ON public.connections
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (scope = 'shared' OR user_id = auth.uid())
  );

CREATE POLICY "Users can create own connections" ON public.connections
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update own connections" ON public.connections
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete connections" ON public.connections
  FOR DELETE USING (
    user_id = auth.uid()
    OR auth.uid() IN (
      SELECT id FROM public.users
      WHERE org_id = connections.org_id AND role = 'admin'
    )
  );
