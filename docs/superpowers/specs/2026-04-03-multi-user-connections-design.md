# Multi-User Connections — Per-User OAuth, Scoping, and Access Control

> Design spec for per-user connections with privacy scoping. Approved 2026-04-03.

## Overview

Connections become per-user. Each person connects their own accounts (Google Calendar, Gmail, etc.) and controls whether their connection is private or shared with the team. Cooper loads the right connections for each user per request.

### Core Rules

1. **Every connection has an owner** (`user_id`) and a **scope** (`personal` or `shared`)
2. Cooper sees: the requesting user's personal connections + all shared connections in the org
3. Cooper never sees another user's personal connections
4. Multiple people can connect the same app — each gets their own OAuth token
5. Shared connections use the owner's Composio entity (OAuth token)
6. Admins can disconnect any connection but can't change scope or access private data
7. Default scope depends on app type: personal tools (calendar, email, drive) default to `personal`; team tools (PostHog, Linear, Sentry) default to `shared`

## Database Changes

### Migration

```sql
-- Add user ownership and scope to connections
ALTER TABLE public.connections
  ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN scope text NOT NULL DEFAULT 'shared' CHECK (scope IN ('personal', 'shared')),
  ADD COLUMN composio_entity_id text;

-- Index for per-user lookups
CREATE INDEX idx_connections_user_id ON public.connections(user_id);
CREATE INDEX idx_connections_scope ON public.connections(scope);

-- Backfill existing connections: assign to org admin, mark as shared
UPDATE public.connections c
SET user_id = (
  SELECT u.id FROM public.users u
  WHERE u.org_id = c.org_id AND u.role = 'admin'
  LIMIT 1
),
composio_entity_id = user_id::text
WHERE user_id IS NULL;

-- Drop old RLS policies and create new ones
DROP POLICY IF EXISTS "Users can view own org connections" ON public.connections;
DROP POLICY IF EXISTS "Users can create connections in own org" ON public.connections;
DROP POLICY IF EXISTS "Users can update own org connections" ON public.connections;
DROP POLICY IF EXISTS "Users can delete own org connections" ON public.connections;

-- New RLS: see your own connections + shared connections in your org
CREATE POLICY "Users can view accessible connections" ON public.connections
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (scope = 'shared' OR user_id = auth.uid())
  );

-- Only create connections for yourself
CREATE POLICY "Users can create own connections" ON public.connections
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

-- Only update your own connections
CREATE POLICY "Users can update own connections" ON public.connections
  FOR UPDATE USING (user_id = auth.uid());

-- Delete: own connections, or admins can delete any in their org
CREATE POLICY "Users can delete connections" ON public.connections
  FOR DELETE USING (
    user_id = auth.uid()
    OR (
      org_id IN (SELECT org_id FROM public.users WHERE id = auth.uid())
      AND auth.uid() IN (SELECT id FROM public.users WHERE org_id = connections.org_id AND role = 'admin')
    )
  );
```

### Connection Row Shape

```
id: uuid
org_id: uuid          — which org
user_id: uuid         — who connected it (NEW)
scope: 'personal' | 'shared'  — visibility (NEW)
composio_entity_id: text       — Composio entity for this connection (NEW)
type: 'platform' | 'mcp' | 'custom'
name: text            — display name (e.g., "Google Calendar")
provider: text        — app slug (e.g., "googlecalendar")
config: jsonb         — tool permissions, resolved actions, etc.
status: 'active' | 'inactive' | 'error'
```

### Types Update

```typescript
export interface Connection {
  id: string;
  org_id: string;
  user_id: string | null;
  scope: 'personal' | 'shared';
  composio_entity_id: string | null;
  type: 'platform' | 'mcp' | 'custom';
  name: string;
  provider: string;
  config: Record<string, unknown>;
  status: 'active' | 'inactive' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
```

## App Default Scope Map

Stored as a constant in code — not in the database.

```typescript
const PERSONAL_BY_DEFAULT = new Set([
  'gmail', 'googlecalendar', 'googledrive', 
  'outlook', 'outlook_calendar', 'onedrive',
  'dropbox', 'notion', 'todoist', 'trello',
]);

function getDefaultScope(appName: string): 'personal' | 'shared' {
  return PERSONAL_BY_DEFAULT.has(appName) ? 'personal' : 'shared';
}
```

## Composio Entity Model

### Per-User Entities

Each user is their own Composio entity. When user A connects Google Calendar:
- Composio session: `composio.create(userA.id)`
- Token stored under entity `userA.id`
- Connection row: `user_id=userA.id, composio_entity_id=userA.id`

### Tool Loading Per Request

```
User sends message (user_id = X)
  → getToolsForUser(supabase, orgId, userId)
  → Query: connections WHERE org_id=orgId AND (user_id=X OR scope='shared') AND status='active'
  → Group connections by composio_entity_id
  → For each unique entity:
      composio.create(entityId).tools() → get Composio tools
  → Merge all tools (dedup by name)
  → Wrap in integration subagent
```

### Cache

Cache key changes from `'composio-tools'` to `'composio-tools:{entityId}'`.
TTL stays at 30 minutes. Multiple cache entries possible (one per entity).

### `getComposioTools` Update

```typescript
// Before
export async function getComposioTools(_entityHint?: string)

// After  
export async function getComposioToolsForEntity(entityId: string)
```

### Registry Update

```typescript
// Before
export async function getToolsForOrg(supabase, orgId, userId?, options?)

// After
export async function getToolsForUser(supabase, orgId, userId, options?)
```

The registry:
1. Loads connections visible to this user (personal + shared)
2. Groups by `composio_entity_id`
3. Loads Composio tools per entity
4. Merges tool sets
5. Wraps in integration subagent (existing pattern)

## Connection Initiate Flow

### Current
```typescript
const session = await composio.create(user.id);
const connectionRequest = await session.authorize(appName, { callbackUrl });
```

### Updated
Same, but also set `user_id`, `scope`, and `composio_entity_id` on the connection row:

```typescript
// In syncConnectionsAction (per-user sync):
for (const appName of activeApps) {
  const existing = await supabase.from('connections')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)  // NEW — per-user check
    .eq('provider', appName)
    .single();

  if (!existing.data) {
    await supabase.from('connections').insert({
      org_id: orgId,
      user_id: userId,                          // NEW
      scope: getDefaultScope(appName),          // NEW
      composio_entity_id: userId,               // NEW
      type: 'platform',
      name: appName,
      provider: appName,
      config: { apps: [appName] },
      status: 'active',
    });
  }
}
```

## Scope Change

Users can change the scope of their own connections:

```typescript
export async function updateConnectionScopeAction(connectionId: string, scope: 'personal' | 'shared') {
  // Only the owner can change scope (enforced by RLS)
  await supabase.from('connections')
    .update({ scope })
    .eq('id', connectionId);
}
```

UI: a toggle or dropdown on the connection detail page: "Private to me" / "Shared with team."

## UI Changes

### Connections Page — Two Sections

```
┌─────────────────────────────────────────┐
│ Your Connections                         │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│ │ Calendar │ │ Gmail    │ │ PostHog  │ │
│ │ Personal │ │ Personal │ │ Shared   │ │
│ └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│ Team Connections                         │
│ ┌──────────┐ ┌──────────┐               │
│ │ Linear   │ │ Sentry   │               │
│ │ By Sarah │ │ By Alex  │               │
│ └──────────┘ └──────────┘               │
│                                          │
│ Add Integration                          │
│ [Browse all integrations...]             │
└─────────────────────────────────────────┘
```

**Your Connections:** Shows connections you own (any scope). Full control — connect, disconnect, change scope.

**Team Connections:** Shows other users' shared connections. Read-only — you can use them but not manage them. Shows who connected it ("By Sarah").

**Connection Card Updates:**
- Badge: "Personal" (lock icon) or "Shared" (globe icon)
- Owner name on team connections

### Connection Detail Page

- **Your connection:** Full controls — disconnect, change scope toggle, tool permissions
- **Team connection:** Read-only view — see tools but can't change permissions. Shows "Connected by [name]"

## Integration Subagent Changes

The integration subagent currently loads Composio tools once globally. With per-user entities, it needs the user's entity ID.

### `createIntegrationTool` Update

```typescript
export function createIntegrationTool(
  composioTools: Record<string, any>,  // Already scoped to user by registry
  connectedServices: string[]
)
```

No change needed here — the registry already passes the right tools. The scoping happens in the registry, not the subagent.

## Sync Flow

### Per-User Sync (on page load)

When a user visits `/connections`:
1. Create Composio session: `composio.create(userId)`
2. Fetch active accounts for this entity from Composio API
3. Compare with connection rows where `user_id = userId`
4. Insert new connections, mark disconnected ones as inactive

### What Happens When Owner Disconnects

If Mo shared their Google Calendar and then disconnects:
1. Connection row marked `status: 'inactive'`
2. No one in the org can use it anymore
3. Team connections section no longer shows it
4. Other users can connect their own if they want

## Migration Path for Existing Data

1. Run migration: add columns, backfill `user_id` to org admin
2. Existing connections become `scope: 'shared'` (preserves current behavior)
3. No breaking changes — everything works as before
4. Per-user connections activate when individual users start connecting their own apps

## What's Not in Scope

- Connection delegation ("let Sarah use my calendar even though it's private") — add later
- Connection groups / teams (beyond personal/shared) — add later
- Composio entity aliasing (using org-level entities for shared connections) — add later if needed
- Connection usage audit log — add later
