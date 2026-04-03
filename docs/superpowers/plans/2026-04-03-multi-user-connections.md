# Multi-User Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-user connections with personal/shared scoping so each team member connects their own accounts and controls visibility.

**Architecture:** Add `user_id`, `scope`, and `composio_entity_id` to connections table. Registry loads connections visible to the requesting user. Composio sessions scoped per entity. UI split into "Your Connections" and "Team Connections."

**Tech Stack:** Supabase (migration + RLS), Composio SDK, Next.js server actions, React components

---

### Task 1: Migration + Types

**Files:**
- Create: `supabase/migrations/020_multi_user_connections.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/020_multi_user_connections.sql`:

```sql
-- Add user ownership and scope to connections
ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'shared' CHECK (scope IN ('personal', 'shared')),
  ADD COLUMN IF NOT EXISTS composio_entity_id text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connections_user_id ON public.connections(user_id);
CREATE INDEX IF NOT EXISTS idx_connections_scope ON public.connections(scope);

-- Backfill: assign existing connections to org admin, mark shared
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

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can view own org connections" ON public.connections;
DROP POLICY IF EXISTS "Users can create connections in own org" ON public.connections;
DROP POLICY IF EXISTS "Users can update own org connections" ON public.connections;
DROP POLICY IF EXISTS "Users can delete own org connections" ON public.connections;

-- New RLS: see your own + shared in your org
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
```

Do NOT apply — just create the file.

- [ ] **Step 2: Update Connection type**

In `src/lib/types.ts`, replace the `Connection` interface:

```typescript
export interface Connection {
  id: string;
  org_id: string;
  user_id: string | null;
  scope: 'personal' | 'shared';
  composio_entity_id: string | null;
  type: 'mcp' | 'custom' | 'platform';
  name: string;
  provider: string;
  config: Record<string, unknown>;
  status: 'active' | 'inactive' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: multi-user connections migration + types

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: App Default Scope + DB Helpers

**Files:**
- Create: `src/modules/connections/scopes.ts`
- Modify: `src/modules/connections/db.ts`

- [ ] **Step 1: Create scopes.ts with default scope map**

Create `src/modules/connections/scopes.ts`:

```typescript
/**
 * Default scope for each app type.
 * Personal apps (calendar, email, drive) default to personal.
 * Team tools (analytics, project management) default to shared.
 */

const PERSONAL_BY_DEFAULT = new Set([
  'gmail', 'googlecalendar', 'googledrive',
  'outlook', 'outlook_calendar', 'onedrive',
  'dropbox', 'notion', 'todoist', 'trello',
]);

export function getDefaultScope(appName: string): 'personal' | 'shared' {
  return PERSONAL_BY_DEFAULT.has(appName.toLowerCase()) ? 'personal' : 'shared';
}
```

- [ ] **Step 2: Update db.ts — add getConnectionsForUser, update createConnection**

In `src/modules/connections/db.ts`, add a new function and update `createConnection`:

Add after imports:
```typescript
import { getDefaultScope } from './scopes';
```

Add new function:
```typescript
/**
 * Get connections visible to a specific user:
 * - Their own connections (any scope)
 * - Other users' shared connections
 */
export async function getConnectionsForUser(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<Connection[]> {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .or(`user_id.eq.${userId},scope.eq.shared`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[connections] Failed to load connections for user:', error);
    return [];
  }

  return data as Connection[];
}
```

Update `createConnection` to accept the new fields:
```typescript
export async function createConnection(
  supabase: SupabaseClient,
  connection: {
    org_id: string;
    user_id: string;
    scope?: 'personal' | 'shared';
    composio_entity_id?: string;
    type: Connection['type'];
    name: string;
    provider: string;
    config: Record<string, unknown>;
  }
): Promise<Connection | null> {
  const { data, error } = await supabase
    .from('connections')
    .insert({
      ...connection,
      scope: connection.scope || getDefaultScope(connection.provider),
      composio_entity_id: connection.composio_entity_id || connection.user_id,
    })
    .select()
    .single();

  if (error) {
    console.error('[connections] Failed to create connection:', error);
    return null;
  }

  return data as Connection;
}
```

Add scope update function:
```typescript
export async function updateConnectionScope(
  supabase: SupabaseClient,
  connectionId: string,
  scope: 'personal' | 'shared'
): Promise<void> {
  await supabase
    .from('connections')
    .update({ scope, updated_at: new Date().toISOString() })
    .eq('id', connectionId);
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: app default scopes + per-user connection queries

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Per-User Composio Entity + Registry Scoping

**Files:**
- Modify: `src/modules/connections/platform/composio.ts`
- Modify: `src/modules/connections/registry.ts`

- [ ] **Step 1: Update composio.ts — per-entity tool loading**

In `src/modules/connections/platform/composio.ts`:

Rename `getComposioTools` to `getComposioToolsForEntity` and make entity ID required:

```typescript
/**
 * Get Composio tools for a specific entity (user).
 */
export async function getComposioToolsForEntity(
  entityId: string
): Promise<Record<string, any>> {
  const cacheKey = `composio-tools:${entityId}`;
  const cached = sessionCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.tools;
  }

  try {
    const composio = getComposioClient();
    const session = await composio.create(entityId);
    const tools = await session.tools();

    const result = (typeof tools === 'object' && tools !== null) ? tools as Record<string, any> : {};

    sessionCache.set(cacheKey, { tools: result, createdAt: Date.now() });
    console.log(`[composio] Loaded ${Object.keys(result).length} tools for entity ${entityId.slice(0, 8)}:`, Object.keys(result));
    return result;
  } catch (error) {
    console.error(`[composio] Failed to get tools for entity ${entityId}:`, error);
    sessionCache.delete(cacheKey);
    return {};
  }
}
```

Remove `findActiveEntityId()` — no longer needed.

Keep `clearComposioCache()` as-is (clears all entries).

- [ ] **Step 2: Update registry.ts — load tools per user**

In `src/modules/connections/registry.ts`:

Update import:
```typescript
import { getComposioToolsForEntity } from './platform/composio';
import { getConnectionsForUser } from './db';
```

Replace `getToolsForOrg` with `getToolsForUser`:

```typescript
export async function getToolsForUser(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  options?: { skipApproval?: boolean }
): Promise<Record<string, any>> {
  const connections = await getConnectionsForUser(supabase, orgId, userId);
  console.log(`[registry] Found ${connections.length} connections for user ${userId.slice(0, 8)}:`,
    connections.map(c => `${c.name}(${c.scope}:${c.user_id?.slice(0, 8) || 'org'})`));

  const allTools: Record<string, any> = {};

  // Group platform connections by composio_entity_id
  const platformConnections = connections.filter(c => c.type === 'platform');
  const entitiesMap = new Map<string, Connection[]>();
  for (const conn of platformConnections) {
    const entityId = conn.composio_entity_id || conn.user_id || userId;
    if (!entitiesMap.has(entityId)) entitiesMap.set(entityId, []);
    entitiesMap.get(entityId)!.push(conn);
  }

  // Load Composio tools per entity
  for (const [entityId, entityConnections] of entitiesMap) {
    try {
      const composioTools = await withRetry(
        () => getComposioToolsForEntity(entityId),
        `composio-tools:${entityId}`,
        { maxRetries: 2, baseDelayMs: 1000 }
      );

      // Build tool permission map from these connections
      const toolPermissions: Record<string, string> = {};
      for (const conn of entityConnections) {
        const perms = (conn.config as any)?.toolPermissions;
        if (perms) Object.assign(toolPermissions, perms);
      }

      // Add meta-tools with approval logic (same as before)
      const READ_VERBS = /^(GET|LIST|SEARCH|FIND|FETCH|READ|RETRIEVE|QUERY|CHECK|SHOW|VIEW|DESCRIBE|COUNT|LOOKUP|DOWNLOAD)/i;

      for (const [name, tool] of Object.entries(composioTools)) {
        if (name === 'COMPOSIO_MULTI_EXECUTE_TOOL' && !options?.skipApproval) {
          const disabledSlugs = new Set(
            Object.entries(toolPermissions)
              .filter(([_, perm]) => perm === 'disabled')
              .map(([slug]) => slug)
          );

          const originalExecute = tool.execute;
          allTools[name] = {
            ...tool,
            execute: async (input: any) => {
              const inputTools: any[] = input?.tools || [];
              const blocked = inputTools.filter((t: any) => disabledSlugs.has(t?.tool_slug));
              if (blocked.length > 0) {
                return { error: `Disabled actions: ${blocked.map((t: any) => t.tool_slug).join(', ')}` };
              }
              return originalExecute?.(input);
            },
            needsApproval: (input: any) => {
              const inputTools: any[] = input?.tools || [];
              for (const t of inputTools) {
                const slug = t?.tool_slug || '';
                const perm = toolPermissions[slug];
                if (perm === 'confirm') return true;
                if (perm === 'auto') continue;
                const action = slug.split('_').slice(1).join('_');
                if (action && !READ_VERBS.test(action)) return true;
              }
              return false;
            },
          };
        } else if (!allTools[name]) {
          allTools[name] = tool;
        }
      }
    } catch (error) {
      console.error(`[registry] Failed to load Composio tools for entity ${entityId}:`, error);
    }
  }

  // Load MCP tools (unchanged)
  const mcpConnections = connections.filter(c => c.type === 'mcp');
  const mcpPromises = mcpConnections.map(async (conn) => {
    try {
      const tools = await withRetry(
        () => getMcpTools(conn.id, conn.config as unknown as McpServerConfig),
        `mcp-tools:${conn.name}`,
        { maxRetries: 1, baseDelayMs: 500 }
      );
      for (const [name, tool] of Object.entries(tools)) {
        allTools[`${conn.provider}_${name}`] = tool;
      }
    } catch (error) {
      console.error(`[registry] Failed to load MCP tools for ${conn.name}:`, error);
      await updateConnectionStatus(supabase, conn.id, 'error', String(error)).catch(() => {});
    }
  });
  await Promise.all(mcpPromises);

  return allTools;
}
```

- [ ] **Step 3: Update all callers of getToolsForOrg → getToolsForUser**

Search for `getToolsForOrg` across the codebase and update:

In `src/app/api/chat/route.ts`:
```typescript
// Before
const tools = await getToolsForOrg(supabase, dbUser.org_id, user.id);
// After
const tools = await getToolsForUser(supabase, dbUser.org_id, user.id);
```

In `src/modules/scheduler/executor.ts`:
```typescript
// Before
const tools = await getToolsForOrg(supabase, task.org_id, undefined, { skipApproval: true });
// After
const tools = await getToolsForUser(supabase, task.org_id, task.user_id, { skipApproval: true });
```

In `src/modules/slack/handlers.ts`:
```typescript
// Before
const tools = await getToolsForOrg(supabase, orgId);
// After
const tools = await getToolsForUser(supabase, orgId, userId);
```

In `src/inngest/functions/background-task.ts` (if it calls getToolsForOrg).

Update the import in each file from `getToolsForOrg` to `getToolsForUser`.

- [ ] **Step 4: Run typecheck + tests**

```bash
pnpm typecheck
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: per-user Composio entities + registry scoped to user

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Sync Per User

**Files:**
- Modify: `src/app/actions/connections.ts`

- [ ] **Step 1: Update syncConnectionsAction to be per-user**

Replace `syncConnectionsAction` in `src/app/actions/connections.ts`:

```typescript
export async function syncConnectionsAction() {
  const { supabase, user, orgId } = await getAuthContext();
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return { error: 'Composio not configured' };

  // Fetch active accounts for THIS user's Composio entity
  const resp = await fetch(
    `https://backend.composio.dev/api/v1/connectedAccounts?showActiveOnly=true&user_uuid=${user.id}`,
    { headers: { 'x-api-key': apiKey } }
  );
  const data = await resp.json();
  const activeApps = [...new Set(
    ((data.items || []) as any[])
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => c.appName)
  )];

  // Check existing connections for this user
  const { data: existing } = await supabase
    .from('connections')
    .select('provider')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .eq('type', 'platform');
  const existingProviders = new Set((existing || []).map((c: any) => c.provider));

  const { getDefaultScope } = await import('@/modules/connections/scopes');

  let synced = 0;
  for (const appName of activeApps) {
    if (existingProviders.has(appName)) continue;
    await supabase.from('connections').insert({
      org_id: orgId,
      user_id: user.id,
      scope: getDefaultScope(appName),
      composio_entity_id: user.id,
      type: 'platform',
      name: appName,
      provider: appName,
      config: { apps: [appName] },
      status: 'active',
    });
    synced++;
  }

  if (synced > 0) {
    clearComposioCache();
  }

  revalidatePath('/connections');
  return { success: true, synced };
}
```

- [ ] **Step 2: Update createConnectionAction to include user_id**

```typescript
export async function createConnectionAction(connection: {
  name: string;
  provider: string;
  type: 'mcp' | 'platform';
  config: Record<string, unknown>;
}) {
  const { supabase, user, orgId } = await getAuthContext();
  const { getDefaultScope } = await import('@/modules/connections/scopes');
  const result = await createConnection(supabase, {
    org_id: orgId,
    user_id: user.id,
    scope: getDefaultScope(connection.provider),
    composio_entity_id: user.id,
    ...connection,
  });
  if (!result) return { error: 'Failed to create connection' };
  revalidatePath('/connections');
  return { success: true, connection: result };
}
```

- [ ] **Step 3: Add scope change action**

```typescript
export async function updateConnectionScopeAction(
  connectionId: string,
  scope: 'personal' | 'shared'
) {
  const { supabase } = await getAuthContext();
  const { updateConnectionScope } = await import('@/modules/connections/db');
  await updateConnectionScope(supabase, connectionId, scope);
  revalidatePath('/connections');
  return { success: true };
}
```

Add to `src/app/actions/index.ts`:
```typescript
export { updateConnectionScopeAction } from './connections';
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: per-user connection sync + scope change action

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI — Two-Section Connections Page

**Files:**
- Modify: `src/components/connections/IntegrationsCatalog.tsx`
- Modify: `src/components/connections/IntegrationCard.tsx`
- Modify: `src/app/(app)/connections/page.tsx`
- Modify: `src/components/connections/ConnectionDetail.tsx`

- [ ] **Step 1: Update connections page to pass userId**

In `src/app/(app)/connections/page.tsx`, pass the user ID to the catalog:

```typescript
return <IntegrationsCatalog
  initialConnections={connections || []}
  integrations={integrations}
  userId={user.id}
/>;
```

- [ ] **Step 2: Update IntegrationsCatalog — two sections**

In `src/components/connections/IntegrationsCatalog.tsx`:

Add `userId` to props:
```typescript
interface IntegrationsCatalogProps {
  initialConnections?: Connection[];
  integrations: Integration[];
  userId: string;
}
```

Split connections into "yours" and "team":
```typescript
const yourConnections = useMemo(() =>
  connections.filter(c => c.user_id === userId),
  [connections, userId]
);

const teamConnections = useMemo(() =>
  connections.filter(c => c.user_id !== userId && c.scope === 'shared'),
  [connections, userId]
);
```

Render two sections — "Your Connections" with full controls, "Team Connections" read-only — above the integration browser grid.

- [ ] **Step 3: Update IntegrationCard — show scope badge**

In `src/components/connections/IntegrationCard.tsx`, show a scope indicator:

```tsx
{connected && (
  <div className="flex items-center gap-1.5 mt-0.5">
    <span className="size-1.5 rounded-full bg-green-500" />
    <span className="text-[11px] text-muted-foreground">
      {connection?.scope === 'personal' ? '🔒 Personal' : 'Connected'}
    </span>
  </div>
)}
```

- [ ] **Step 4: Update ConnectionDetail — scope toggle for owner**

In `src/components/connections/ConnectionDetail.tsx`, add a scope toggle between "Personal" and "Shared" that calls `updateConnectionScopeAction`. Only show when `connectionId` matches the current user's connection.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: two-section connections UI — Your Connections + Team Connections

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Apply Migration + Test

- [ ] **Step 1: Apply migration via Supabase MCP**

Apply the SQL from `supabase/migrations/020_multi_user_connections.sql`.

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 3: Verify**

- Connect an integration as user A → should create with user_id and default scope
- Check connections page → "Your Connections" shows your connections
- Change scope to shared → appears in team connections for other users
- Verify Cooper loads the right tools per user in chat

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: multi-user connections — complete

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
