# Phase 1: Reliability & UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve caching, scheduler reliability, and redesign the connections page.

**Architecture:** Four independent improvements — tool caching for performance, scheduler failure handling + rolling summary for reliability, and a connections page redesign for UX. Each can be implemented and shipped as a separate PR.

**Tech Stack:** Next.js, Supabase, Composio SDK, shadcn/ui, AI SDK (generateText for summary)

---

### Task 1: Tool Caching — Increase TTL and Cache Invalidation

**Files:**
- Modify: `src/modules/connections/platform/composio.ts`
- Modify: `src/app/actions.ts` (syncConnectionsAction, deleteConnectionAction)

- [ ] **Step 1: Increase cache TTL to 30 minutes**

In `src/modules/connections/platform/composio.ts`, change:
```typescript
const CACHE_TTL_MS = 5 * 60 * 1000;
```
to:
```typescript
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — tools rarely change
```

- [ ] **Step 2: Add cache invalidation on connection changes**

In `src/app/actions.ts`, add `clearComposioCache()` import and calls:

```typescript
// At top of file, add import:
import { clearComposioCache } from '@/modules/connections/platform/composio';
```

In `syncConnectionsAction`, after the sync loop completes (before the return):
```typescript
  if (synced > 0) {
    clearComposioCache();
  }
```

In `deleteConnectionAction`, after `clearMcpClientCache(id)`:
```typescript
  clearComposioCache();
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/modules/connections/platform/composio.ts src/app/actions.ts
git commit -m "perf: increase Composio tool cache TTL to 30min, invalidate on connection changes"
```

---

### Task 2: Scheduler Failure Notification

**Files:**
- Modify: `src/modules/scheduler/executor.ts`
- Modify: `src/modules/scheduler/db.ts`
- Modify: `src/components/schedules/ScheduleCard.tsx`
- Create: `supabase/migrations/011_scheduler_failure_reason.sql`

- [ ] **Step 1: Create migration for failure_reason column**

Create `supabase/migrations/011_scheduler_failure_reason.sql`:
```sql
ALTER TABLE public.scheduled_tasks ADD COLUMN IF NOT EXISTS failure_reason text;
```

Apply via Supabase MCP tool.

- [ ] **Step 2: Update ScheduledTask type**

In `src/lib/types.ts`, add to the `ScheduledTask` interface:
```typescript
failure_reason: string | null;
```

- [ ] **Step 3: Store failure reason and notify user on auto-pause**

In `src/modules/scheduler/db.ts`, update `recordTaskFailure` to accept and store the error message:

```typescript
export async function recordTaskFailure(
  supabase: SupabaseClient,
  taskId: string,
  errorMessage?: string,
  maxConsecutiveFailures: number = 3
): Promise<boolean> {
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('consecutive_failures, name, org_id, user_id')
    .eq('id', taskId)
    .single();

  if (error || !data) return false;

  const newCount = (data.consecutive_failures || 0) + 1;

  if (newCount >= maxConsecutiveFailures) {
    await supabase
      .from('scheduled_tasks')
      .update({
        consecutive_failures: newCount,
        failure_reason: errorMessage || 'Unknown error',
        status: 'paused',
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    // Notify user by creating a system message in their most recent thread
    const { data: recentThread } = await supabase
      .from('threads')
      .select('id')
      .eq('org_id', data.org_id)
      .is('scheduled_task_id', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (recentThread) {
      await supabase.from('messages').insert({
        thread_id: recentThread.id,
        role: 'assistant',
        content: `⚠️ Your scheduled task "${data.name}" has been paused after ${newCount} consecutive failures.\n\nLast error: ${errorMessage || 'Unknown error'}\n\nYou can resume it from the Schedules page after investigating the issue.`,
        metadata: { system_notification: true, task_id: taskId },
      });
    }

    console.warn(`[scheduler] Task ${taskId} auto-paused after ${newCount} consecutive failures`);
    return true;
  } else {
    await supabase
      .from('scheduled_tasks')
      .update({
        consecutive_failures: newCount,
        failure_reason: errorMessage || null,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    return false;
  }
}
```

- [ ] **Step 4: Pass error message to recordTaskFailure in executor**

In `src/modules/scheduler/executor.ts`, update the catch block:

```typescript
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (log?.id) {
      await supabase
        .from('execution_logs')
        .update({
          status: 'error',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq('id', log.id);
    }

    console.error(`[scheduler] Task ${task.id} failed:`, error);
    await recordTaskFailure(supabase, task.id, errorMessage);
  }
```

- [ ] **Step 5: Show failure reason on ScheduleCard**

In `src/components/schedules/ScheduleCard.tsx`, add after the status badge area:

```tsx
{task.status === 'paused' && task.failure_reason && (
  <p className="text-xs text-destructive mt-1">
    ⚠️ {task.failure_reason}
  </p>
)}
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: auto-pause scheduled tasks after 3 failures, notify user with error reason"
```

---

### Task 3: Scheduler Rolling Summary

**Files:**
- Create: `supabase/migrations/012_scheduler_rolling_summary.sql`
- Modify: `src/modules/scheduler/executor.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/012_scheduler_rolling_summary.sql`:
```sql
ALTER TABLE public.scheduled_tasks ADD COLUMN IF NOT EXISTS rolling_summary text;
```

Apply via Supabase MCP tool.

- [ ] **Step 2: Update ScheduledTask type**

In `src/lib/types.ts`, add to the `ScheduledTask` interface:
```typescript
rolling_summary: string | null;
```

- [ ] **Step 3: Add summary generation function to executor**

In `src/modules/scheduler/executor.ts`, add after the imports:

```typescript
async function updateRollingSummary(
  supabase: SupabaseClient,
  taskId: string,
  runOutput: string,
  existingSummary: string | null
): Promise<void> {
  try {
    const prompt = existingSummary
      ? `You maintain a rolling summary of a recurring scheduled task's outputs. Update the summary with the latest run results. Keep it under 500 words. Focus on trends, changes, and patterns across runs.\n\nExisting summary:\n${existingSummary}\n\nLatest run output:\n${runOutput.slice(0, 2000)}`
      : `Summarize this first run of a recurring scheduled task in 2-3 sentences. Focus on key findings that would be useful context for the next run.\n\nRun output:\n${runOutput.slice(0, 2000)}`;

    const result = await generateText({
      model: google('gemini-2.5-flash'),
      prompt,
    });

    if (result.text) {
      await supabase
        .from('scheduled_tasks')
        .update({ rolling_summary: result.text })
        .eq('id', taskId);
    }
  } catch (err) {
    console.error(`[scheduler] Failed to update rolling summary for ${taskId}:`, err);
  }
}
```

- [ ] **Step 4: Inject rolling summary into system prompt**

In `src/modules/scheduler/executor.ts`, in the `executeScheduledTask` function, after building the system prompt with memory context, add:

```typescript
    if (task.rolling_summary) {
      systemPrompt += `\n\n## Previous Run Context\nHere is a summary of previous runs of this task. Use it for comparisons and trend analysis:\n${task.rolling_summary}`;
    }
```

- [ ] **Step 5: Call updateRollingSummary after successful run**

In `src/modules/scheduler/executor.ts`, after `await resetTaskFailures(supabase, task.id);`, add:

```typescript
    // Update rolling summary for next run context
    const fullOutput = result.text || steps.map(s => s.text).filter(Boolean).join('\n');
    if (fullOutput) {
      updateRollingSummary(supabase, task.id, fullOutput, task.rolling_summary)
        .catch(err => console.error('[scheduler] Rolling summary update failed:', err));
    }
```

Note: `steps` is already defined earlier in the function as `result.steps || []`.

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: rolling summary context for scheduled tasks — trends across runs"
```

---

### Task 4: Connections Page Redesign

**Files:**
- Modify: `src/components/connections/IntegrationsCatalog.tsx` (rewrite)
- Modify: `src/components/connections/IntegrationCard.tsx` (rewrite)

- [ ] **Step 1: Rewrite IntegrationCard as compact card**

Replace `src/components/connections/IntegrationCard.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import type { Integration } from '@/lib/integrations-catalog';

interface IntegrationCardProps {
  integration: Integration;
  connected: boolean;
}

export function IntegrationCard({ integration, connected }: IntegrationCardProps) {
  const router = useRouter();

  return (
    <Card
      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => router.push(`/connections/${integration.composioApp}`)}
    >
      {integration.logo ? (
        <img
          src={integration.logo}
          alt={integration.name}
          className="size-10 rounded-lg object-contain"
        />
      ) : (
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
          {integration.name[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{integration.name}</p>
        {connected && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="size-2 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">1 account connected</span>
          </div>
        )}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Rewrite IntegrationsCatalog with tabs, toggle, and 3-column grid**

Replace `src/components/connections/IntegrationsCatalog.tsx`:

```tsx
'use client';

import { useEffect, useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { IntegrationCard } from './IntegrationCard';
import { AddConnectionModal } from './AddConnectionModal';
import type { Integration } from '@/lib/integrations-catalog';
import {
  deleteConnectionAction,
  syncConnectionsAction,
  createConnectionAction,
} from '@/app/actions';
import type { Connection } from '@/lib/types';
import { cn } from '@/lib/utils';

interface IntegrationsCatalogProps {
  initialConnections?: Connection[];
  integrations: Integration[];
}

export function IntegrationsCatalog({ initialConnections = [], integrations }: IntegrationsCatalogProps) {
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'popular'>('all');
  const [showConnectedOnly, setShowConnectedOnly] = useState(false);
  const [mcpModalOpened, setMcpModalOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    startTransition(async () => {
      await syncConnectionsAction();
      router.refresh();
    });
  }, []);

  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    connections.forEach((c) => {
      const match = integrations.find(
        (i) => i.composioApp === c.provider || i.id === c.provider || c.name.toLowerCase().includes(i.name.toLowerCase())
      );
      if (match) ids.add(match.id);
    });
    return ids;
  }, [connections, integrations]);

  const filtered = useMemo(() => {
    return integrations.filter((i) => {
      const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
      const matchesConnected = !showConnectedOnly || connectedIds.has(i.id);
      const matchesTab = tab === 'all' || (tab === 'popular' && i.toolCount > 15);
      return matchesSearch && matchesConnected && matchesTab;
    }).sort((a, b) => {
      const aConnected = connectedIds.has(a.id) ? 0 : 1;
      const bConnected = connectedIds.has(b.id) ? 0 : 1;
      if (aConnected !== bConnected) return aConnected - bConnected;
      return a.name.localeCompare(b.name);
    });
  }, [search, tab, showConnectedOnly, connectedIds, integrations]);

  const handleMcpAdd = async (connection: {
    name: string;
    provider: string;
    type: 'mcp' | 'platform';
    config: Record<string, unknown>;
  }) => {
    const result = await createConnectionAction(connection);
    if (result.success) router.refresh();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect the tools you use and let Cooper perform tasks across various apps.
          </p>
        </div>
        <Button variant="outline" onClick={() => setMcpModalOpened(true)}>
          <PlusIcon className="size-4 mr-2" />
          Add Custom MCP
        </Button>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={`Search from ${integrations.length} integrations...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('all')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              tab === 'all' ? 'bg-muted font-medium' : 'hover:bg-muted/50'
            )}
          >
            All integrations
          </button>
          <button
            onClick={() => setTab('popular')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              tab === 'popular' ? 'bg-muted font-medium' : 'hover:bg-muted/50'
            )}
          >
            Popular integrations
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show connected only</span>
          <Switch checked={showConnectedOnly} onCheckedChange={setShowConnectedOnly} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            connected={connectedIds.has(integration.id)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-3 text-center text-muted-foreground py-8">
            No integrations found.
          </p>
        )}
      </div>

      <AddConnectionModal
        opened={mcpModalOpened}
        onClose={() => setMcpModalOpened(false)}
        onAdd={handleMcpAdd}
      />
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/components/connections/IntegrationCard.tsx src/components/connections/IntegrationsCatalog.tsx
git commit -m "feat: redesign connections page — 3-column grid, tabs, logo, connected toggle"
```
