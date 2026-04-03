# Background Agents — Inngest-Powered Async Execution

> Design spec for background agent system using Inngest. Approved 2026-04-02.

## Overview

Cooper can run complex, multi-step tasks in the background. The user gets an immediate acknowledgment, and Cooper posts progress updates to the conversation as each step completes. Built on Inngest — each step is a separate serverless invocation, sidestepping Vercel's 60s timeout.

Inngest also replaces the existing cron-based scheduler, giving one unified async execution engine for both ad-hoc background work and recurring scheduled tasks.

## How It Works

### Background Tasks (ad-hoc)

```
User: "Analyze our PostHog data and create a report for #analytics"

1. Main agent detects complex task (3+ steps)
2. Calls start_background_task → inserts job row, sends Inngest event
3. Returns immediately: "On it! I'll post updates here as I go 🔍"
4. Inngest executes steps as separate function invocations:
   Step 1/4: Fetch PostHog data → posts "📊 Fetched 1,200 events"
   Step 2/4: Analyze trends → posts "🔬 Found 3 anomalies"
   Step 3/4: Write report → posts "📝 Report ready"
   Step 4/4: Post to Slack → posts "✅ Posted to #analytics"
5. Final message with complete result
```

### Scheduled Tasks (recurring)

A single Inngest cron function runs every minute, checks for due scheduled tasks, and sends individual events for each one. Each scheduled task execution runs as a separate Inngest function with the same step-based pattern.

Replaces: `src/app/api/cron/dispatch/route.ts` and the cron-based polling.

## Inngest Setup

### Client

`src/inngest/client.ts`:
```typescript
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'cooper' });
```

### Webhook Route

`src/app/api/inngest/route.ts` — serves all Inngest functions. Inngest calls this route to execute function steps.

### Functions

Two function files:
- `src/inngest/functions/background-task.ts` — Ad-hoc background job execution
- `src/inngest/functions/scheduled-task.ts` — Recurring scheduled task execution + cron checker

## Database

### New Table: `background_jobs`

```sql
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  goal text not null,
  steps jsonb not null default '[]',
  current_step int not null default 0,
  result text,
  error text,
  inngest_event_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_background_jobs_thread on public.background_jobs(thread_id);
create index idx_background_jobs_status on public.background_jobs(status) where status = 'running';

alter table public.background_jobs enable row level security;

create policy "Org members can manage background jobs"
  on public.background_jobs for all
  using (org_id in (select org_id from public.users where id = auth.uid()));
```

### Step Schema (jsonb)

```json
[
  { "id": "step-1", "action": "Fetch PostHog events", "integration": "posthog", "status": "done", "output": "Found 1,200 events" },
  { "id": "step-2", "action": "Analyze trends", "integration": null, "status": "running", "output": null },
  { "id": "step-3", "action": "Post to Slack", "integration": "slack", "status": "pending", "output": null }
]
```

### Existing Table: `scheduled_tasks`

Stays as-is. Stores schedule definitions (cron, prompt, name, rolling_summary, etc.). Execution moves from the cron dispatcher to Inngest.

## Inngest Function: Background Task

```typescript
export const backgroundTask = inngest.createFunction(
  { id: "cooper-background-task", retries: 2 },
  { event: "cooper/background-task" },
  async ({ event, step }) => {
    const { jobId, threadId, orgId, userId, goal, steps, connectedServices } = event.data;
    const supabase = createServiceClient();

    for (let i = 0; i < steps.length; i++) {
      const stepDef = steps[i];

      await step.run(`execute-${stepDef.id}`, async () => {
        // Update job: mark step as running
        await updateJobStep(supabase, jobId, stepDef.id, 'running');

        // Post progress to thread
        await supabase.from('messages').insert({
          thread_id: threadId,
          role: 'assistant',
          content: `🔄 **Step ${i + 1}/${steps.length}:** ${stepDef.action}`,
          metadata: { background_job: jobId, step: stepDef.id },
        });

        // Execute: use integration subagent for integration steps,
        // or generateText for analysis/synthesis steps
        const result = await executeBackgroundStep(stepDef, {
          orgId, userId, connectedServices,
        });

        // Update job: mark step as done
        await updateJobStep(supabase, jobId, stepDef.id, 'done', result);

        // Post result
        await supabase.from('messages').insert({
          thread_id: threadId,
          role: 'assistant',
          content: `✅ **Step ${i + 1}/${steps.length}:** ${result}`,
          metadata: { background_job: jobId, step: stepDef.id },
        });

        return result;
      });
    }

    // Compile final result and post completion
    await step.run("complete", async () => {
      const job = await getBackgroundJob(supabase, jobId);
      const stepResults = job.steps
        .filter(s => s.status === 'done')
        .map(s => s.output)
        .join('\n\n');

      await updateJobStatus(supabase, jobId, 'completed', stepResults);

      await supabase.from('messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: `🎉 **Done!** ${goal}\n\n${stepResults}`,
        metadata: { background_job: jobId, final: true },
      });
    });
  }
);
```

### Step Execution

`executeBackgroundStep` determines how to run each step:
- If the step has an `integration` field → use the integration subagent (loads Composio tools)
- If the step is analysis/synthesis → use `generateText` with the appropriate model
- If the step needs code execution → use sandbox tools (if E2B available)

This reuses the existing integration subagent pattern from `integration-subagent.ts`.

## Inngest Function: Scheduled Task

### Cron Checker (runs every minute)

```typescript
export const scheduledTaskChecker = inngest.createFunction(
  { id: "cooper-scheduled-checker" },
  { cron: "* * * * *" },
  async ({ step }) => {
    const dueTasks = await step.run("check-due", async () => {
      const supabase = createServiceClient();
      return claimDueTasksForDispatch(supabase);
    });

    // Send individual events for each due task
    for (const task of dueTasks) {
      await step.sendEvent("dispatch-task", {
        name: "cooper/scheduled-task",
        data: { taskId: task.id },
      });
    }
  }
);
```

### Task Executor

```typescript
export const scheduledTaskExecutor = inngest.createFunction(
  { id: "cooper-scheduled-task", retries: 2 },
  { event: "cooper/scheduled-task" },
  async ({ event, step }) => {
    const { taskId } = event.data;
    const supabase = createServiceClient();

    const task = await step.run("load-task", () =>
      getScheduledTask(supabase, taskId)
    );

    // Check expiry
    if (task.ends_at && new Date(task.ends_at) <= new Date()) {
      await step.run("pause-expired", () =>
        updateScheduledTaskStatus(supabase, taskId, 'paused')
      );
      return;
    }

    // Create thread for this run
    const thread = await step.run("create-thread", () =>
      createRunThread(supabase, task)
    );

    // Execute task (same logic as current executor, using integration subagent)
    const result = await step.run("execute", () =>
      executeScheduledTask(supabase, task, thread.id)
    );

    // Update rolling summary
    await step.run("update-summary", () =>
      updateRollingSummary(supabase, taskId, result, task.rolling_summary)
    );

    // Update next run time
    await step.run("update-next-run", () =>
      updateTaskAfterRun(supabase, taskId, getNextRunTime(task.cron).toISOString())
    );
  }
);
```

## Agent Tool: `start_background_task`

New file: `src/modules/agent/background-tools.ts`

```typescript
start_background_task: tool({
  description: `Start a complex task in the background. Use when the task has 3+ steps, involves multiple integrations, or will take more than a minute. You'll respond immediately, and post progress updates to this conversation as each step completes.`,
  inputSchema: z.object({
    goal: z.string().describe('What the user wants accomplished'),
    steps: z.array(z.object({
      id: z.string(),
      action: z.string().describe('What to do in this step'),
      integration: z.string().nullable().describe('Which service to use (slack, posthog, etc.), or null for analysis/synthesis'),
    })).min(2).max(15),
  }),
  execute: async ({ goal, steps }) => {
    // Insert job row
    const job = await createBackgroundJob(supabase, {
      org_id: orgId,
      user_id: userId,
      thread_id: threadId,
      goal,
      steps: steps.map(s => ({ ...s, status: 'pending', output: null })),
    });

    // Send Inngest event
    await inngest.send({
      name: 'cooper/background-task',
      data: {
        jobId: job.id,
        threadId,
        orgId,
        userId,
        goal,
        steps,
        connectedServices,
      },
    });

    return {
      started: true,
      jobId: job.id,
      stepCount: steps.length,
      message: `Working on "${goal}" in the background. I'll post updates here as each step completes.`,
    };
  },
})
```

## System Prompt

Replace the deep work section with:

```
## Background Tasks
For complex tasks with 3+ steps or involving multiple integrations, use start_background_task.
You'll respond immediately to the user, and post progress updates to the conversation as each step finishes.
Don't try to do multi-step integration work inline — send it to background.
Examples of background tasks:
- "Analyze our PostHog data and post a report to Slack"
- "Research competitors and create a summary document"
- "Check all our integrations and give me a status update"
```

## What Gets Removed

| File | Reason |
|------|--------|
| `src/modules/agent/deep-work-tools.ts` | Replaced by `background-tools.ts` |
| `src/modules/agent/deep-work.ts` | State tracking replaced by `background_jobs` table |
| `src/components/chat/DeepWorkProgress.tsx` | Progress is now regular messages |
| `src/app/api/cron/dispatch/route.ts` | Replaced by Inngest scheduled function |
| `src/app/actions/deep-work.ts` | No longer needed |

References to deep work in `engine.ts`, `ChatMessages.tsx`, and the system prompt are updated.

## Real-Time Updates

Background job message inserts into the thread trigger the existing Supabase real-time subscription in `AppShellLayout.tsx`. The user sees updates appear automatically without polling. If they navigate away and come back, the messages are persisted — they'll see the full history.

## Error Handling

- Inngest retries each step up to 2 times on failure
- On final failure: job status set to 'failed', error message posted to thread
- Scheduled tasks: `consecutive_failures` counter still incremented, auto-pause after 3 failures (same behavior, different execution engine)

## Not in Scope

- Job cancellation (user can't stop a running background job — add later)
- Job priority/queuing (all jobs run immediately)
- Parallel step execution (steps run sequentially — add later via `step.parallel`)
