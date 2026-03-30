# Cooper Phase 2: Connections & Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tool calling to Cooper's agent engine via MCP servers, so users can connect external tools and Cooper can call them during conversations. Users manage connections through a web UI.

**Architecture:** The tool registry (`modules/connections/`) aggregates tools from all sources (MCP servers for now, custom connectors and platform adapters later). The agent engine passes these tools to the AI SDK's `streamText` call. MCP connections are stored in Supabase and loaded per-org. The `@ai-sdk/mcp` package bridges MCP servers into AI SDK tool format.

**Tech Stack:** Vercel AI SDK (`tool`, `streamText` with `stopWhen`), `@ai-sdk/mcp`, `@modelcontextprotocol/sdk`, Supabase (connections table), Mantine UI, Zod

**Spec:** `docs/superpowers/specs/2026-03-28-cooper-platform-design.md` — "Connections & Tool System" section

**Scoping note:** This plan covers MCP-based connections only. Custom OAuth connectors (GitHub, Linear) and unified API platform (Composio/Nango) are Phase 2b — MCP gives immediate access to hundreds of tools without OAuth infrastructure.

---

## File Structure

```
src/
├── modules/
│   ├── agent/
│   │   ├── engine.ts             # MODIFY — add tools param to streamText, agentic loop
│   │   └── types.ts              # MODIFY — add tools to AgentInput
│   └── connections/
│       ├── types.ts              # Connection, ToolDef, ToolRegistry interfaces
│       ├── registry.ts           # ToolRegistry implementation — aggregates tools from all sources
│       ├── mcp/
│       │   ├── client.ts         # MCP client manager — connects to MCP servers, extracts tools
│       │   └── types.ts          # MCP-specific config types
│       └── db.ts                 # Supabase CRUD for connections table
│
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts          # MODIFY — load tools for org, pass to engine
│   │   └── connections/
│   │       └── route.ts          # CRUD API for connections
│   └── (app)/
│       └── connections/
│           └── page.tsx           # Connection management UI
│
├── components/
│   └── connections/
│       ├── ConnectionList.tsx     # List of active connections
│       ├── AddConnectionModal.tsx # Modal to add new MCP connection
│       └── ConnectionCard.tsx     # Single connection card with status + tools
│
└── supabase/
    └── migrations/
        └── 002_connections.sql    # Connections table + RLS
```

---

## Task 1: Database — Connections Table

**Files:**
- Create: `supabase/migrations/002_connections.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/002_connections.sql`:

```sql
-- Connections table
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('mcp', 'custom', 'platform')),
  name text not null,
  provider text not null,
  config jsonb not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive', 'error')),
  error_message text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Indexes
create index idx_connections_org_id on public.connections(org_id);

-- RLS
alter table public.connections enable row level security;

create policy "Users can view own org connections"
  on public.connections for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can create connections in own org"
  on public.connections for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org connections"
  on public.connections for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org connections"
  on public.connections for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));
```

- [ ] **Step 2: Run the migration**

Paste into Supabase SQL Editor and run it. (User must do this manually until Supabase CLI or MCP is configured.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_connections.sql
git commit -m "feat: add connections table with RLS"
```

---

## Task 2: Connection Types & DB Layer

**Files:**
- Create: `src/modules/connections/types.ts`
- Create: `src/modules/connections/db.ts`
- Create: `src/lib/types.ts` (add Connection type)

- [ ] **Step 1: Create connection types**

Create `src/modules/connections/types.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export interface ToolDef {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  source: 'mcp' | 'custom' | 'platform';
  connectionId: string;
}

export interface ToolRegistry {
  getToolsForOrg(orgId: string): Promise<Record<string, ReturnType<typeof tool>>>;
}

export interface McpConnectionConfig {
  url: string;
  transport: 'sse' | 'stdio';
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
}
```

- [ ] **Step 2: Add Connection to shared types**

Add to the bottom of `src/lib/types.ts`:

```typescript
export interface Connection {
  id: string;
  org_id: string;
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

- [ ] **Step 3: Create connections DB layer**

Create `src/modules/connections/db.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { Connection } from '@/lib/types';

export async function getConnectionsForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Connection[]> {
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[connections] Failed to load connections:', error);
    return [];
  }

  return data as Connection[];
}

export async function createConnection(
  supabase: SupabaseClient,
  connection: {
    org_id: string;
    type: Connection['type'];
    name: string;
    provider: string;
    config: Record<string, unknown>;
  }
): Promise<Connection | null> {
  const { data, error } = await supabase
    .from('connections')
    .insert(connection)
    .select()
    .single();

  if (error) {
    console.error('[connections] Failed to create connection:', error);
    return null;
  }

  return data as Connection;
}

export async function deleteConnection(
  supabase: SupabaseClient,
  connectionId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId);

  if (error) {
    console.error('[connections] Failed to delete connection:', error);
    return false;
  }

  return true;
}

export async function updateConnectionStatus(
  supabase: SupabaseClient,
  connectionId: string,
  status: Connection['status'],
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('connections')
    .update({
      status,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/connections/ src/lib/types.ts
git commit -m "feat: add connection types and supabase db layer"
```

---

## Task 3: MCP Client Manager

**Files:**
- Create: `src/modules/connections/mcp/types.ts`
- Create: `src/modules/connections/mcp/client.ts`

- [ ] **Step 1: Install MCP packages**

```bash
pnpm add @ai-sdk/mcp @modelcontextprotocol/sdk
```

- [ ] **Step 2: Create MCP types**

Create `src/modules/connections/mcp/types.ts`:

```typescript
export interface McpServerConfig {
  url: string;
  transport: 'sse';
  headers?: Record<string, string>;
}
```

Note: For MVP we only support SSE transport (remote MCP servers over HTTP). Stdio transport (local processes) can be added later.

- [ ] **Step 3: Create MCP client manager**

Create `src/modules/connections/mcp/client.ts`:

```typescript
import { createMcpClient } from '@ai-sdk/mcp';
import type { McpServerConfig } from './types';

// Cache MCP clients by connection ID to avoid reconnecting on every request
const clientCache = new Map<string, { client: ReturnType<typeof createMcpClient>; createdAt: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedClient(connectionId: string): ReturnType<typeof createMcpClient> | null {
  const entry = clientCache.get(connectionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    clientCache.delete(connectionId);
    return null;
  }
  return entry.client;
}

export async function getMcpTools(
  connectionId: string,
  config: McpServerConfig
): Promise<Record<string, any>> {
  let client = getCachedClient(connectionId);

  if (!client) {
    client = createMcpClient({
      transport: {
        type: 'sse',
        url: config.url,
        headers: config.headers,
      },
    });
    clientCache.set(connectionId, { client, createdAt: Date.now() });
  }

  try {
    const tools = await client.tools();
    return tools;
  } catch (error) {
    console.error(`[mcp] Failed to get tools from ${config.url}:`, error);
    clientCache.delete(connectionId);
    return {};
  }
}

export function clearMcpClientCache(connectionId?: string): void {
  if (connectionId) {
    clientCache.delete(connectionId);
  } else {
    clientCache.clear();
  }
}
```

IMPORTANT: Check the actual `@ai-sdk/mcp` API. The `createMcpClient` function may have a different name or signature. Read the package types in `node_modules/@ai-sdk/mcp` to confirm:
- How to create a client (might be `experimental_createMCPClient` or similar)
- How to specify SSE transport
- How to get tools (might be `.tools()` or `.getTools()`)
- What format the tools come back in (should be compatible with AI SDK `streamText` tools param)

Adapt the code to match the actual API.

- [ ] **Step 4: Verify it compiles**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/connections/mcp/ package.json pnpm-lock.yaml
git commit -m "feat: add MCP client manager with caching"
```

---

## Task 4: Tool Registry

**Files:**
- Create: `src/modules/connections/registry.ts`

- [ ] **Step 1: Create the tool registry**

Create `src/modules/connections/registry.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { getConnectionsForOrg } from './db';
import { getMcpTools } from './mcp/client';
import type { McpServerConfig } from './mcp/types';
import type { Connection } from '@/lib/types';

export async function getToolsForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, any>> {
  const connections = await getConnectionsForOrg(supabase, orgId);

  const allTools: Record<string, any> = {};

  // Load tools from each active connection in parallel
  const toolPromises = connections.map(async (conn) => {
    try {
      const tools = await getToolsForConnection(conn);
      // Prefix tool names with connection name to avoid collisions
      for (const [name, tool] of Object.entries(tools)) {
        allTools[`${conn.provider}_${name}`] = tool;
      }
    } catch (error) {
      console.error(`[registry] Failed to load tools for connection ${conn.id}:`, error);
    }
  });

  await Promise.all(toolPromises);

  return allTools;
}

async function getToolsForConnection(conn: Connection): Promise<Record<string, any>> {
  switch (conn.type) {
    case 'mcp':
      return getMcpTools(conn.id, conn.config as unknown as McpServerConfig);
    case 'custom':
      // Phase 2b: custom connectors
      return {};
    case 'platform':
      // Phase 2b: unified API platform
      return {};
    default:
      return {};
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/connections/registry.ts
git commit -m "feat: add tool registry that aggregates tools from all connection sources"
```

---

## Task 5: Wire Tools into Agent Engine

**Files:**
- Modify: `src/modules/agent/types.ts`
- Modify: `src/modules/agent/engine.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Update agent types to accept tools**

Replace `src/modules/agent/types.ts`:

```typescript
export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  messages: AgentMessage[];
  modelOverride?: string;
  tools?: Record<string, any>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
```

- [ ] **Step 2: Update engine to pass tools and enable agentic loop**

Replace `src/modules/agent/engine.ts`:

```typescript
import { streamText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import type { ModelMessage } from 'ai';
import type { AgentInput, AgentMessage } from './types';

const MODELS: Record<string, string> = {
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
};

const DEFAULT_MODEL = 'gemini-flash';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate. You are helpful, concise, and action-oriented.
You help users with their work by connecting to their tools and completing tasks.
Be direct and professional. Use markdown formatting when it helps readability.
When you have tools available, use them proactively to get information or take actions.
Always explain what you did after using a tool.`;

function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    if (msg.role === 'tool') {
      return { role: 'user', content: msg.content };
    }
    return { role: msg.role, content: msg.content };
  });
}

export function createAgentStream(input: AgentInput) {
  const modelId = input.modelOverride || DEFAULT_MODEL;
  const modelName = MODELS[modelId] || MODELS[DEFAULT_MODEL];

  const hasTools = input.tools && Object.keys(input.tools).length > 0;

  const result = streamText({
    model: google(modelName),
    system: SYSTEM_PROMPT,
    messages: toModelMessages(input.messages),
    ...(hasTools ? {
      tools: input.tools,
      stopWhen: stepCountIs(10),
    } : {}),
    onError: ({ error }) => {
      console.error('[agent] Stream error:', error);
    },
  });

  return result;
}
```

- [ ] **Step 3: Update chat API route to load and pass tools**

In `src/app/api/chat/route.ts`, add tool loading. Add this import at the top:

```typescript
import { getToolsForOrg } from '@/modules/connections/registry';
```

Then after the `agentInput` object is created (around line 77), add the tools:

```typescript
  // Load tools for this org's connections
  const tools = await getToolsForOrg(supabase, dbUser.org_id);

  const result = createAgentStream({
    ...agentInput,
    tools,
  });
```

Replace the existing `const result = createAgentStream(agentInput);` line with the above.

- [ ] **Step 4: Verify it compiles**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/agent/ src/app/api/chat/route.ts
git commit -m "feat: wire tool registry into agent engine with agentic loop"
```

---

## Task 6: Connections API Route

**Files:**
- Create: `src/app/api/connections/route.ts`

- [ ] **Step 1: Create the connections CRUD API**

Create `src/app/api/connections/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import {
  getConnectionsForOrg,
  createConnection,
  deleteConnection,
} from '@/modules/connections/db';
import { clearMcpClientCache } from '@/modules/connections/mcp/client';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    return new Response('User not found', { status: 404 });
  }

  const connections = await getConnectionsForOrg(supabase, dbUser.org_id);
  return Response.json(connections);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    return new Response('User not found', { status: 404 });
  }

  const body = await req.json();
  const { name, provider, type, config } = body as {
    name: string;
    provider: string;
    type: 'mcp' | 'custom' | 'platform';
    config: Record<string, unknown>;
  };

  if (!name || !provider || !type || !config) {
    return new Response('Missing required fields: name, provider, type, config', { status: 400 });
  }

  const connection = await createConnection(supabase, {
    org_id: dbUser.org_id,
    type,
    name,
    provider,
    config,
  });

  if (!connection) {
    return new Response('Failed to create connection', { status: 500 });
  }

  return Response.json(connection, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get('id');

  if (!connectionId) {
    return new Response('Missing connection id', { status: 400 });
  }

  // Clear cached MCP client when deleting a connection
  clearMcpClientCache(connectionId);

  const success = await deleteConnection(supabase, connectionId);

  if (!success) {
    return new Response('Failed to delete connection', { status: 500 });
  }

  return Response.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/connections/
git commit -m "feat: add connections CRUD API route"
```

---

## Task 7: Connection Management UI

**Files:**
- Create: `src/components/connections/ConnectionCard.tsx`
- Create: `src/components/connections/AddConnectionModal.tsx`
- Create: `src/components/connections/ConnectionList.tsx`
- Create: `src/app/(app)/connections/page.tsx`
- Modify: `src/components/chat/AppShellLayout.tsx` (add nav link)

- [ ] **Step 1: Create ConnectionCard component**

Create `src/components/connections/ConnectionCard.tsx`:

```tsx
'use client';

import { Card, Group, Text, Badge, ActionIcon, Stack } from '@mantine/core';
import { IconTrash, IconPlug } from '@tabler/icons-react';
import type { Connection } from '@/lib/types';

interface ConnectionCardProps {
  connection: Connection;
  onDelete: (id: string) => void;
}

export function ConnectionCard({ connection, onDelete }: ConnectionCardProps) {
  const statusColor = {
    active: 'green',
    inactive: 'gray',
    error: 'red',
  }[connection.status];

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between">
        <Group gap="sm">
          <IconPlug size={20} />
          <Stack gap={2}>
            <Text fw={500} size="sm">{connection.name}</Text>
            <Text size="xs" c="dimmed">{connection.provider}</Text>
          </Stack>
        </Group>
        <Group gap="xs">
          <Badge color={statusColor} variant="light" size="sm">
            {connection.status}
          </Badge>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => onDelete(connection.id)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      </Group>
      {connection.error_message && (
        <Text size="xs" c="red" mt="xs">{connection.error_message}</Text>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Create AddConnectionModal component**

Create `src/components/connections/AddConnectionModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Modal, TextInput, Button, Stack, Select } from '@mantine/core';

interface AddConnectionModalProps {
  opened: boolean;
  onClose: () => void;
  onAdd: (connection: {
    name: string;
    provider: string;
    type: 'mcp';
    config: { url: string; transport: 'sse' };
  }) => void;
}

export function AddConnectionModal({ opened, onClose, onAdd }: AddConnectionModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    setLoading(true);
    await onAdd({
      name: name.trim(),
      provider: name.trim().toLowerCase().replace(/\s+/g, '-'),
      type: 'mcp',
      config: { url: url.trim(), transport: 'sse' },
    });
    setLoading(false);
    setName('');
    setUrl('');
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add MCP Connection">
      <form onSubmit={handleSubmit}>
        <Stack>
          <TextInput
            label="Name"
            placeholder="e.g., GitHub MCP Server"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            label="Server URL"
            placeholder="https://mcp-server.example.com/sse"
            required
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
          <Button type="submit" loading={loading} fullWidth>
            Add connection
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Create ConnectionList component**

Create `src/components/connections/ConnectionList.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Stack, Button, Title, Text, Group } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { ConnectionCard } from './ConnectionCard';
import { AddConnectionModal } from './AddConnectionModal';
import type { Connection } from '@/lib/types';

export function ConnectionList() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadConnections() {
    const res = await fetch('/api/connections');
    if (res.ok) {
      setConnections(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    loadConnections();
  }, []);

  const handleAdd = async (connection: {
    name: string;
    provider: string;
    type: 'mcp';
    config: { url: string; transport: 'sse' };
  }) => {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
    });

    if (res.ok) {
      await loadConnections();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/connections?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setConnections((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Title order={2}>Connections</Title>
            <Text c="dimmed" size="sm">Connect MCP servers to give Cooper access to tools.</Text>
          </div>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setModalOpened(true)}
          >
            Add connection
          </Button>
        </Group>

        {loading && <Text c="dimmed">Loading...</Text>}

        {!loading && connections.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl">
            No connections yet. Add an MCP server to get started.
          </Text>
        )}

        {connections.map((conn) => (
          <ConnectionCard
            key={conn.id}
            connection={conn}
            onDelete={handleDelete}
          />
        ))}
      </Stack>

      <AddConnectionModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onAdd={handleAdd}
      />
    </>
  );
}
```

- [ ] **Step 4: Create connections page**

Create `src/app/(app)/connections/page.tsx`:

```tsx
import { ConnectionList } from '@/components/connections/ConnectionList';

export default function ConnectionsPage() {
  return <ConnectionList />;
}
```

- [ ] **Step 5: Add navigation link to sidebar**

In `src/components/chat/AppShellLayout.tsx`, add a nav link to the connections page. Read the current file first, then add a navigation section below the AppShell.Navbar's ChatSidebar:

Update the component to include a footer nav:

```tsx
'use client';

import { AppShell } from '@mantine/core';
import { ChatSidebar } from '@/components/chat/ChatSidebar';

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      navbar={{ width: 280, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="md">
        <ChatSidebar />
      </AppShell.Navbar>
      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
```

Add to `ChatSidebar.tsx` — add a NavLink to connections above the sign-out button. Add this import and JSX:

```tsx
// Add to imports:
import { IconPlugConnected } from '@tabler/icons-react';

// Add above the sign-out Button:
<NavLink
  label="Connections"
  leftSection={<IconPlugConnected size={16} />}
  onClick={() => router.push('/connections')}
  active={false}
  style={{ borderRadius: 'var(--mantine-radius-md)' }}
/>
```

- [ ] **Step 6: Verify it compiles**

```bash
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/connections/ src/app/\(app\)/connections/ src/components/chat/
git commit -m "feat: add connection management UI with add/delete for MCP servers"
```

---

## Task 8: Tool Call Display in Chat UI

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: Update MessageBubble to render tool calls**

Read the current `src/components/chat/MessageBubble.tsx`, then update it to handle `tool-invocation` parts that the AI SDK sends during streaming. The `parts` array from `useChat` includes objects with `type: 'tool-invocation'` containing `toolName`, `args`, `state`, and `result`.

Replace the component:

```tsx
'use client';

import { Paper, Text, Box, Code, Collapse, Group, Badge } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { useState } from 'react';

interface MessagePart {
  type: string;
  text?: string;
  toolInvocation?: {
    toolName: string;
    args: Record<string, unknown>;
    state: string;
    result?: unknown;
  };
  [key: string]: unknown;
}

interface MessageBubbleProps {
  role: string;
  parts: MessagePart[];
}

export function MessageBubble({ role, parts }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <Paper
        p="sm"
        radius="lg"
        maw="70%"
        style={{
          backgroundColor: isUser ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-0)',
        }}
      >
        {parts.map((part, i) => {
          if (part.type === 'text' && part.text) {
            return (
              <Text
                key={i}
                size="sm"
                c={isUser ? 'white' : undefined}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {part.text}
              </Text>
            );
          }

          if (part.type === 'tool-invocation' && part.toolInvocation) {
            return (
              <ToolCallDisplay
                key={i}
                toolName={part.toolInvocation.toolName}
                args={part.toolInvocation.args}
                state={part.toolInvocation.state}
                result={part.toolInvocation.result}
              />
            );
          }

          return null;
        })}
      </Paper>
    </Box>
  );
}

function ToolCallDisplay({
  toolName,
  args,
  state,
  result,
}: {
  toolName: string;
  args: Record<string, unknown>;
  state: string;
  result?: unknown;
}) {
  const [expanded, setExpanded] = useState(false);

  const stateColor = state === 'result' ? 'green' : state === 'error' ? 'red' : 'blue';
  const stateLabel = state === 'result' ? 'Done' : state === 'error' ? 'Error' : 'Running...';

  return (
    <Box my={4}>
      <Group
        gap="xs"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconTool size={14} />
        <Text size="xs" fw={500}>{toolName}</Text>
        <Badge size="xs" color={stateColor} variant="light">{stateLabel}</Badge>
      </Group>
      <Collapse in={expanded}>
        <Code block mt={4} style={{ fontSize: 11 }}>
          {JSON.stringify({ args, result }, null, 2)}
        </Code>
      </Collapse>
    </Box>
  );
}
```

IMPORTANT: Check the actual `useChat` message parts format in AI SDK v6. The tool call part might use a different type name or structure. Look at the `UIMessage` type to confirm what tool-related parts look like. Common variations: `tool-invocation`, `tool-call`, or a nested structure. Adapt accordingly.

- [ ] **Step 2: Verify it compiles**

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat: display tool calls inline in chat messages"
```

---

## Task 9: End-to-End Test with a Real MCP Server

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Add a test MCP connection**

Go to `/connections`, click "Add connection", and add a public MCP server for testing. A good test server is any publicly available MCP server that exposes simple tools (e.g., a weather or time MCP server). Enter the name and SSE URL.

- [ ] **Step 3: Test tool calling in chat**

Go to `/chat`, start a new conversation, and ask Cooper to use one of the tools from the connected MCP server. Verify:
1. Cooper calls the tool
2. The tool call appears inline in the message
3. Cooper uses the tool result to formulate a response

- [ ] **Step 4: Verify tool persistence in messages**

Check that tool calls are captured in the message metadata by looking at the `messages` table in Supabase.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve issues found during e2e testing"
```

---

## Task 10: Build Verification

- [ ] **Step 1: Run the production build**

```bash
pnpm build
```

Fix any type errors or build issues.

- [ ] **Step 2: Verify all routes**

The build output should show:
```
├ ƒ /api/chat
├ ƒ /api/connections
├ ƒ /connections
```

- [ ] **Step 3: Commit any final fixes**

```bash
git add -u
git commit -m "fix: resolve build issues for phase 2"
```

---

## Summary

After completing all tasks, you'll have:
- `connections` table in Supabase with RLS
- Tool registry that aggregates tools from MCP servers
- MCP client manager with connection caching
- Agent engine with agentic loop (multi-step tool calling via `stopWhen`)
- Connections management UI (add/delete MCP servers)
- Tool call display in chat messages (collapsible inline)
- Ready for Phase 2b (custom OAuth connectors, unified API platform)
