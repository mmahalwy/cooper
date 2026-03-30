# Cooper Phase 4: Scheduler & Crons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create scheduled tasks via natural language ("every Monday at 9am, summarize my PRs"). Cooper parses the schedule, saves it, and a cron dispatcher executes them automatically.

**Architecture:** A single Vercel Cron Job hits `/api/cron/dispatch` every 5 minutes. The dispatcher queries Supabase for tasks due to run, executes each via the agent engine (with tools + memory), saves the output as a message in a dedicated thread, and logs the execution. Users manage tasks via a UI at `/schedules` and can also create them conversationally in chat. The agent uses `generateObject` to parse NL into cron expressions.

**Tech Stack:** Vercel Cron Jobs (`vercel.json`), Supabase (scheduled_tasks + execution_logs tables), Vercel AI SDK (`generateText` for non-streaming execution, `generateObject` for NL parsing), cron expression matching via `cron-parser`

**Spec:** `docs/superpowers/specs/2026-03-28-cooper-platform-design.md` — Scheduler & Crons section

---

## File Structure

```
src/
├── modules/
│   └── scheduler/
│       ├── types.ts              # ScheduledTask, ExecutionLog interfaces
│       ├── db.ts                 # Supabase CRUD for scheduled_tasks + execution_logs
│       ├── parser.ts             # NL → cron expression via generateObject
│       ├── matcher.ts            # Check which tasks are due to run right now
│       └── executor.ts           # Run a scheduled task through the agent engine
│
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── dispatch/
│   │   │       └── route.ts      # Vercel Cron endpoint — finds and runs due tasks
│   │   └── schedules/
│   │       └── route.ts          # CRUD API for scheduled tasks
│   └── (app)/
│       └── schedules/
│           └── page.tsx          # Schedule management UI
│
├── components/
│   └── schedules/
│       ├── ScheduleList.tsx      # List of scheduled tasks
│       ├── ScheduleCard.tsx      # Single task display with status
│       └── CreateScheduleModal.tsx # NL schedule creation
│
├── supabase/
│   └── migrations/
│       └── 004_scheduler.sql     # scheduled_tasks + execution_logs tables
│
└── vercel.json                   # Cron job config (every 5 min)
```

---

## Task 1: Database — Scheduled Tasks & Execution Logs

**Files:**
- Create: `supabase/migrations/004_scheduler.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/004_scheduler.sql`:

```sql
-- Scheduled tasks table
create table public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  cron text not null,
  prompt text not null,
  skill_id uuid references public.skills(id) on delete set null,
  channel_config jsonb not null default '{"channel": "web"}',
  status text not null default 'active' check (status in ('active', 'paused')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_scheduled_tasks_org_id on public.scheduled_tasks(org_id);
create index idx_scheduled_tasks_next_run on public.scheduled_tasks(next_run_at)
  where status = 'active';

-- Execution logs table
create table public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.scheduled_tasks(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete set null,
  status text not null check (status in ('running', 'success', 'error')),
  output text,
  error_message text,
  started_at timestamptz default now() not null,
  completed_at timestamptz,
  tokens_used integer,
  duration_ms integer
);

create index idx_execution_logs_task_id on public.execution_logs(task_id);

-- RLS for scheduled_tasks
alter table public.scheduled_tasks enable row level security;

create policy "Users can view own org scheduled tasks"
  on public.scheduled_tasks for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can create scheduled tasks in own org"
  on public.scheduled_tasks for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org scheduled tasks"
  on public.scheduled_tasks for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org scheduled tasks"
  on public.scheduled_tasks for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));

-- RLS for execution_logs
alter table public.execution_logs enable row level security;

create policy "Users can view execution logs for own org tasks"
  on public.execution_logs for select
  using (task_id in (
    select id from public.scheduled_tasks
    where org_id in (select org_id from public.users where id = auth.uid())
  ));
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_scheduler.sql
git commit -m "feat: add scheduled_tasks and execution_logs tables with RLS"
```

---

## Task 2: Scheduler Types & DB Layer

**Files:**
- Create: `src/modules/scheduler/types.ts`
- Create: `src/modules/scheduler/db.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create scheduler types**

Create `src/modules/scheduler/types.ts`:

```typescript
export interface ScheduledTask {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  cron: string;
  prompt: string;
  skill_id: string | null;
  channel_config: { channel: 'web' | 'slack'; destination?: string };
  status: 'active' | 'paused';
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionLog {
  id: string;
  task_id: string;
  thread_id: string | null;
  status: 'running' | 'success' | 'error';
  output: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  tokens_used: number | null;
  duration_ms: number | null;
}
```

- [ ] **Step 2: Add ScheduledTask to shared types**

Add to bottom of `src/lib/types.ts`:

```typescript
export interface ScheduledTask {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  cron: string;
  prompt: string;
  skill_id: string | null;
  channel_config: { channel: 'web' | 'slack'; destination?: string };
  status: 'active' | 'paused';
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionLog {
  id: string;
  task_id: string;
  thread_id: string | null;
  status: 'running' | 'success' | 'error';
  output: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  tokens_used: number | null;
  duration_ms: number | null;
}
```

- [ ] **Step 3: Create scheduler DB layer**

Create `src/modules/scheduler/db.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduledTask, ExecutionLog } from '@/lib/types';

export async function getScheduledTasksForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<ScheduledTask[]> {
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[scheduler] Failed to load tasks:', error);
    return [];
  }
  return data as ScheduledTask[];
}

export async function createScheduledTask(
  supabase: SupabaseClient,
  task: {
    org_id: string;
    user_id: string;
    name: string;
    cron: string;
    prompt: string;
    skill_id?: string;
    channel_config?: { channel: 'web' | 'slack'; destination?: string };
    next_run_at: string;
  }
): Promise<ScheduledTask | null> {
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .insert({
      ...task,
      channel_config: task.channel_config || { channel: 'web' },
    })
    .select('*')
    .single();

  if (error) {
    console.error('[scheduler] Failed to create task:', error);
    return null;
  }
  return data as ScheduledTask;
}

export async function updateScheduledTaskStatus(
  supabase: SupabaseClient,
  taskId: string,
  status: 'active' | 'paused'
): Promise<void> {
  await supabase
    .from('scheduled_tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId);
}

export async function deleteScheduledTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('scheduled_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('[scheduler] Failed to delete task:', error);
    return false;
  }
  return true;
}

export async function getDueTasksForDispatch(
  supabase: SupabaseClient
): Promise<ScheduledTask[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[scheduler] Failed to get due tasks:', error);
    return [];
  }
  return data as ScheduledTask[];
}

export async function updateTaskAfterRun(
  supabase: SupabaseClient,
  taskId: string,
  nextRunAt: string
): Promise<void> {
  await supabase
    .from('scheduled_tasks')
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: nextRunAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

export async function createExecutionLog(
  supabase: SupabaseClient,
  log: {
    task_id: string;
    thread_id?: string;
    status: 'running' | 'success' | 'error';
    output?: string;
    error_message?: string;
    duration_ms?: number;
    tokens_used?: number;
  }
): Promise<ExecutionLog | null> {
  const { data, error } = await supabase
    .from('execution_logs')
    .insert({
      ...log,
      completed_at: log.status !== 'running' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[scheduler] Failed to create execution log:', error);
    return null;
  }
  return data as ExecutionLog;
}

export async function getExecutionLogsForTask(
  supabase: SupabaseClient,
  taskId: string,
  limit = 10
): Promise<ExecutionLog[]> {
  const { data, error } = await supabase
    .from('execution_logs')
    .select('*')
    .eq('task_id', taskId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[scheduler] Failed to load logs:', error);
    return [];
  }
  return data as ExecutionLog[];
}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/scheduler/ src/lib/types.ts
git commit -m "feat: add scheduler types and supabase db layer"
```

---

## Task 3: NL Schedule Parser + Cron Matcher

**Files:**
- Create: `src/modules/scheduler/parser.ts`
- Create: `src/modules/scheduler/matcher.ts`

- [ ] **Step 1: Install cron-parser**

```bash
pnpm add cron-parser
```

- [ ] **Step 2: Create NL schedule parser**

Create `src/modules/scheduler/parser.ts`:

```typescript
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const scheduleSchema = z.object({
  name: z.string().describe('Short name for the scheduled task'),
  cron: z.string().describe('Cron expression (5 fields: minute hour day-of-month month day-of-week). Use UTC time.'),
  prompt: z.string().describe('The prompt to send to the AI agent when this task runs'),
  humanReadable: z.string().describe('Human-readable description of when this runs, e.g., "Every Monday at 9:00 AM UTC"'),
});

export type ParsedSchedule = z.infer<typeof scheduleSchema>;

export async function parseScheduleFromNL(
  userDescription: string
): Promise<ParsedSchedule> {
  const result = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: scheduleSchema,
    prompt: `Parse the following natural language description into a scheduled task definition.
The current date/time is ${new Date().toISOString()}.

User's description:
"${userDescription}"

Generate:
1. A short name for the task
2. A valid cron expression (5 fields, UTC timezone)
3. The prompt that should be sent to the AI agent each time the task runs
4. A human-readable description of the schedule

Examples of cron expressions:
- "0 9 * * 1" = Every Monday at 9:00 AM UTC
- "0 14 * * *" = Every day at 2:00 PM UTC
- "30 8 * * 1-5" = Weekdays at 8:30 AM UTC
- "0 0 1 * *" = First day of every month at midnight UTC`,
  });

  return result.object;
}
```

- [ ] **Step 3: Create cron matcher**

Create `src/modules/scheduler/matcher.ts`:

```typescript
import { parseExpression } from 'cron-parser';

export function getNextRunTime(cronExpression: string): Date {
  const interval = parseExpression(cronExpression, {
    utc: true,
  });
  return interval.next().toDate();
}

export function isDue(nextRunAt: string | null): boolean {
  if (!nextRunAt) return false;
  return new Date(nextRunAt) <= new Date();
}
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm build
git add src/modules/scheduler/ package.json pnpm-lock.yaml
git commit -m "feat: add NL schedule parser and cron matcher"
```

---

## Task 4: Scheduler Executor

**Files:**
- Create: `src/modules/scheduler/executor.ts`

- [ ] **Step 1: Create the executor**

This module runs a scheduled task by calling the agent engine (non-streaming via `generateText`), saves the result to a thread, and logs the execution.

Create `src/modules/scheduler/executor.ts`:

```typescript
import { generateText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { SupabaseClient } from '@supabase/supabase-js';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { updateTaskAfterRun, createExecutionLog } from './db';
import { getNextRunTime } from './matcher';
import type { ScheduledTask } from '@/lib/types';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate executing a scheduled task.
Complete the task described below. Be thorough but concise in your output.
Use any available tools to get the information needed.`;

export async function executeScheduledTask(
  supabase: SupabaseClient,
  task: ScheduledTask
): Promise<void> {
  const startTime = Date.now();

  // Create execution log (running)
  const log = await createExecutionLog(supabase, {
    task_id: task.id,
    status: 'running',
  });

  try {
    // Create a thread for this execution
    const { data: thread } = await supabase
      .from('threads')
      .insert({
        org_id: task.org_id,
        user_id: task.user_id,
        title: `[Scheduled] ${task.name}`,
      })
      .select('id')
      .single();

    // Load tools and memory context
    const tools = await getToolsForOrg(supabase, task.org_id);
    const memoryContext = await retrieveContext(supabase, task.org_id, task.prompt);

    let systemPrompt = SYSTEM_PROMPT;
    if (memoryContext.knowledge.length) {
      systemPrompt += `\n\n## Organization context:\n${memoryContext.knowledge.map((k) => `- ${k}`).join('\n')}`;
    }

    // Add built-in tools
    const builtInTools = {
      google_search: google.tools.googleSearch({}),
    };
    const allTools = { ...builtInTools, ...tools };

    // Execute via generateText (non-streaming for scheduled tasks)
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      prompt: task.prompt,
      tools: allTools,
      stopWhen: stepCountIs(10),
    });

    const durationMs = Date.now() - startTime;

    // Save assistant response to thread
    if (thread?.id) {
      await supabase.from('messages').insert([
        {
          thread_id: thread.id,
          role: 'user',
          content: task.prompt,
        },
        {
          thread_id: thread.id,
          role: 'assistant',
          content: result.text,
          metadata: { scheduled: true, task_id: task.id },
        },
      ]);
    }

    // Update execution log (success)
    if (log?.id) {
      await supabase
        .from('execution_logs')
        .update({
          status: 'success',
          output: result.text,
          thread_id: thread?.id,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          tokens_used: result.usage?.totalTokens,
        })
        .eq('id', log.id);
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update execution log (error)
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
  } finally {
    // Always update next_run_at
    const nextRun = getNextRunTime(task.cron);
    await updateTaskAfterRun(supabase, task.id, nextRun.toISOString());
  }
}
```

- [ ] **Step 2: Verify and commit**

```bash
pnpm build
git add src/modules/scheduler/executor.ts
git commit -m "feat: add scheduler executor — runs tasks via agent engine"
```

---

## Task 5: Cron Dispatch Endpoint + Vercel Config

**Files:**
- Create: `src/app/api/cron/dispatch/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create the cron dispatch endpoint**

Create `src/app/api/cron/dispatch/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { getDueTasksForDispatch } from '@/modules/scheduler/db';
import { executeScheduledTask } from '@/modules/scheduler/executor';

export const maxDuration = 300; // 5 min max for cron execution

export async function GET(request: Request) {
  // Verify this is a legitimate cron request
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = await createClient();
  const dueTasks = await getDueTasksForDispatch(supabase);

  if (dueTasks.length === 0) {
    return Response.json({ executed: 0 });
  }

  // Execute tasks sequentially to avoid overwhelming resources
  let executed = 0;
  let errors = 0;

  for (const task of dueTasks) {
    try {
      await executeScheduledTask(supabase, task);
      executed++;
    } catch (error) {
      errors++;
      console.error(`[cron] Failed to execute task ${task.id}:`, error);
    }
  }

  return Response.json({ executed, errors, total: dueTasks.length });
}
```

IMPORTANT: The `createClient` used here is the server client which uses cookies. For a cron endpoint (no user session), this may not work. The implementer should check whether a service-role Supabase client is needed here. If so, create one using `createClient(supabaseUrl, serviceRoleKey)` directly — the cron endpoint runs without a user session so RLS will block everything with the anon key. A `SUPABASE_SERVICE_ROLE_KEY` env var will be needed.

- [ ] **Step 2: Create vercel.json**

Create `vercel.json` at project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/dispatch",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Add CRON_SECRET to .env.local**

Add to `.env.local`:
```
CRON_SECRET=your-random-secret-here
```

- [ ] **Step 4: Verify and commit**

```bash
pnpm build
git add src/app/api/cron/ vercel.json
git commit -m "feat: add cron dispatch endpoint with Vercel cron config"
```

---

## Task 6: Schedules CRUD API

**Files:**
- Create: `src/app/api/schedules/route.ts`
- Create: `src/app/api/schedules/parse/route.ts`

- [ ] **Step 1: Create schedules CRUD API**

Create `src/app/api/schedules/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import {
  getScheduledTasksForOrg,
  createScheduledTask,
  deleteScheduledTask,
  updateScheduledTaskStatus,
} from '@/modules/scheduler/db';
import { getNextRunTime } from '@/modules/scheduler/matcher';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const tasks = await getScheduledTasksForOrg(supabase, dbUser.org_id);
  return Response.json(tasks);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const body = await req.json();
  const { name, cron, prompt } = body;

  if (!name || !cron || !prompt) {
    return new Response('Missing required fields: name, cron, prompt', { status: 400 });
  }

  let nextRunAt: string;
  try {
    nextRunAt = getNextRunTime(cron).toISOString();
  } catch {
    return new Response('Invalid cron expression', { status: 400 });
  }

  const task = await createScheduledTask(supabase, {
    org_id: dbUser.org_id,
    user_id: user.id,
    name,
    cron,
    prompt,
    next_run_at: nextRunAt,
  });

  if (!task) return new Response('Failed to create schedule', { status: 500 });
  return Response.json(task, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id, status } = await req.json();
  if (!id || !status) return new Response('Missing id or status', { status: 400 });

  await updateScheduledTaskStatus(supabase, id, status);
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const success = await deleteScheduledTask(supabase, id);
  if (!success) return new Response('Failed to delete', { status: 500 });
  return Response.json({ success: true });
}
```

- [ ] **Step 2: Create schedule parse API**

Create `src/app/api/schedules/parse/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { parseScheduleFromNL } from '@/modules/scheduler/parser';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { description } = await req.json();
  if (!description) return new Response('Missing description', { status: 400 });

  const parsed = await parseScheduleFromNL(description);
  return Response.json(parsed);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/schedules/
git commit -m "feat: add schedules CRUD and NL parse API"
```

---

## Task 7: Schedule Management UI

**Files:**
- Create: `src/components/schedules/ScheduleCard.tsx`
- Create: `src/components/schedules/CreateScheduleModal.tsx`
- Create: `src/components/schedules/ScheduleList.tsx`
- Create: `src/app/(app)/schedules/page.tsx`
- Modify: `src/components/chat/ChatSidebar.tsx`

- [ ] **Step 1: Create ScheduleCard**

Create `src/components/schedules/ScheduleCard.tsx`:

```tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClockIcon, TrashIcon, PauseIcon, PlayIcon } from 'lucide-react';
import type { ScheduledTask } from '@/lib/types';

interface ScheduleCardProps {
  task: ScheduledTask;
  onDelete: (id: string) => void;
  onToggle: (id: string, status: 'active' | 'paused') => void;
}

export function ScheduleCard({ task, onDelete, onToggle }: ScheduleCardProps) {
  const isActive = task.status === 'active';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ClockIcon className="size-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">{task.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{task.prompt}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={isActive ? 'default' : 'secondary'}>{task.status}</Badge>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{task.cron}</code>
                {task.next_run_at && (
                  <span className="text-xs text-muted-foreground">
                    Next: {new Date(task.next_run_at).toLocaleString()}
                  </span>
                )}
                {task.last_run_at && (
                  <span className="text-xs text-muted-foreground">
                    Last: {new Date(task.last_run_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => onToggle(task.id, isActive ? 'paused' : 'active')}
            >
              {isActive ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive"
              onClick={() => onDelete(task.id)}
            >
              <TrashIcon />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create CreateScheduleModal**

Create `src/components/schedules/CreateScheduleModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface CreateScheduleModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateScheduleModal({ opened, onClose, onCreated }: CreateScheduleModalProps) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/schedules/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim() }),
    });

    if (res.ok) {
      setParsed(await res.json());
    } else {
      setError('Failed to parse schedule');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!parsed) return;
    setLoading(true);

    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: parsed.name,
        cron: parsed.cron,
        prompt: parsed.prompt,
      }),
    });

    setLoading(false);
    if (res.ok) {
      setDescription('');
      setParsed(null);
      onCreated();
      onClose();
    } else {
      const data = await res.text();
      setError(data || 'Failed to create schedule');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) { onClose(); setParsed(null); setError(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Schedule</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="flex flex-col gap-4">
            <Textarea
              placeholder='e.g., "Every Monday at 9am, summarize my open PRs and post to #engineering"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleParse} disabled={loading || !description.trim()}>
              {loading ? 'Parsing...' : 'Parse schedule'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium">{parsed.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{parsed.humanReadable}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Cron expression</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">{parsed.cron}</code>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Prompt</p>
              <p className="text-xs text-muted-foreground">{parsed.prompt}</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setParsed(null)}>Edit</Button>
              <Button className="flex-1" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save schedule'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create ScheduleList and page**

Create `src/components/schedules/ScheduleList.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { ScheduleCard } from './ScheduleCard';
import { CreateScheduleModal } from './CreateScheduleModal';
import type { ScheduledTask } from '@/lib/types';

export function ScheduleList() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    const res = await fetch('/api/schedules');
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadTasks(); }, []);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/schedules?id=${id}`, { method: 'DELETE' });
    if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToggle = async (id: string, status: 'active' | 'paused') => {
    const res = await fetch('/api/schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status } : t))
      );
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Schedules</h2>
            <p className="text-sm text-muted-foreground">
              Automated tasks that Cooper runs on a schedule.
            </p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Create schedule
          </Button>
        </div>

        {loading && <p className="text-muted-foreground">Loading...</p>}

        {!loading && tasks.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No schedules yet. Create one to automate a recurring task.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <ScheduleCard
              key={task.id}
              task={task}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>

      <CreateScheduleModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onCreated={loadTasks}
      />
    </>
  );
}
```

Create `src/app/(app)/schedules/page.tsx`:

```tsx
import { ScheduleList } from '@/components/schedules/ScheduleList';

export default function SchedulesPage() {
  return <ScheduleList />;
}
```

- [ ] **Step 4: Add nav link to sidebar**

In `src/components/chat/ChatSidebar.tsx`, add `CalendarClockIcon` to lucide imports and a "Schedules" link after Skills:

```tsx
<button
  onClick={() => router.push('/schedules')}
  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
>
  <CalendarClockIcon className="size-4" />
  Schedules
</button>
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm build
git add src/components/schedules/ src/app/\(app\)/schedules/ src/components/chat/ChatSidebar.tsx
git commit -m "feat: add schedule management UI with NL creation"
```

---

## Task 8: Build Verification + E2E Test

- [ ] **Step 1: Run the build**

```bash
pnpm build
```

- [ ] **Step 2: Run the migration**

Run `supabase/migrations/004_scheduler.sql` in Supabase SQL Editor.

- [ ] **Step 3: Test schedule creation**

1. Go to `/schedules`, click "Create schedule"
2. Describe: "Every weekday at 9am, give me a morning briefing"
3. Verify it parses into a cron + prompt
4. Save, verify it appears in the list

- [ ] **Step 4: Test cron dispatch locally**

```bash
curl -H "Authorization: Bearer your-cron-secret" http://localhost:3000/api/cron/dispatch
```

Should return `{"executed": 0}` if no tasks are due, or execute any due tasks.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve issues found during phase 4 e2e testing"
```

---

## Summary

After completing all tasks, you'll have:
- **scheduled_tasks + execution_logs** tables with RLS
- **NL schedule parser** — "every Monday at 9am" → cron expression + prompt
- **Cron matcher** — determines which tasks are due based on next_run_at
- **Executor** — runs due tasks through the agent engine (with tools + memory), saves output to threads
- **Cron dispatch endpoint** — `/api/cron/dispatch` hit every 5 min by Vercel
- **Schedules API** — CRUD + NL parse
- **Schedules UI** — create/pause/resume/delete at `/schedules`
- **Sidebar navigation** updated
- Ready for Phase 5 (Slack channel)
