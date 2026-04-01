# Phase 3: Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Cooper the ability to create, present, and execute plans for complex tasks. Add clarifying questions before acting on ambiguous requests.

**Architecture:** New `plans` table stores structured plans with steps. Two new tools (`create_plan`, `execute_plan`) let Cooper create and execute plans. A `PlanView` component renders plans in the chat UI with approve/cancel controls. System prompt additions guide when to plan vs act directly.

**Tech Stack:** Supabase (plans table), AI SDK tools, React (PlanView component), shadcn/ui

**Prerequisite:** Phase 2 (model routing) should be deployed first — planning quality depends on a smarter model for complex tasks.

---

### Task 1: Plans Table Migration

**Files:**
- Create: `supabase/migrations/013_plans.sql`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/013_plans.sql`:

```sql
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'executing', 'completed', 'failed')),
  steps jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_plans_thread_id on public.plans(thread_id);
create index idx_plans_org_id on public.plans(org_id);

alter table public.plans enable row level security;

create policy "Org members can manage plans"
  on public.plans for all
  using (org_id in (select org_id from public.users where id = auth.uid()));
```

Apply via Supabase MCP tool.

- [ ] **Step 2: Add Plan type**

In `src/lib/types.ts`, add:

```typescript
export interface PlanStep {
  id: string;
  description: string;
  tool_hint: string | null;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  output: string | null;
}

export interface Plan {
  id: string;
  thread_id: string;
  org_id: string;
  title: string;
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  steps: PlanStep[];
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: plans table migration and types"
```

---

### Task 2: Planning DB Helpers

**Files:**
- Create: `src/modules/planning/db.ts`

- [ ] **Step 1: Create planning db module**

Create `src/modules/planning/db.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { Plan, PlanStep } from '@/lib/types';

export async function createPlan(
  supabase: SupabaseClient,
  plan: { thread_id: string; org_id: string; title: string; steps: PlanStep[] }
): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('plans')
    .insert(plan)
    .select('*')
    .single();

  if (error) {
    console.error('[planning] Failed to create plan:', error);
    return null;
  }
  return data as Plan;
}

export async function getPlan(
  supabase: SupabaseClient,
  planId: string
): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) return null;
  return data as Plan;
}

export async function updatePlanStatus(
  supabase: SupabaseClient,
  planId: string,
  status: Plan['status']
): Promise<void> {
  await supabase
    .from('plans')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', planId);
}

export async function updatePlanStep(
  supabase: SupabaseClient,
  planId: string,
  stepId: string,
  updates: Partial<Pick<PlanStep, 'status' | 'output'>>
): Promise<void> {
  const plan = await getPlan(supabase, planId);
  if (!plan) return;

  const updatedSteps = plan.steps.map((step) =>
    step.id === stepId ? { ...step, ...updates } : step
  );

  await supabase
    .from('plans')
    .update({ steps: updatedSteps, updated_at: new Date().toISOString() })
    .eq('id', planId);
}

export async function getPlansForThread(
  supabase: SupabaseClient,
  threadId: string
): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data as Plan[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/planning/db.ts
git commit -m "feat: planning DB helpers — create, get, update plans and steps"
```

---

### Task 3: Planning Tools

**Files:**
- Create: `src/modules/planning/tools.ts`
- Modify: `src/modules/agent/engine.ts`

- [ ] **Step 1: Create planning tools**

Create `src/modules/planning/tools.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createPlan, getPlan, updatePlanStatus, updatePlanStep } from './db';

export function createPlanningTools(supabase: SupabaseClient, orgId: string, threadId: string) {
  return {
    create_plan: tool({
      description: `Create a structured plan for a complex task. Use this when the task involves 3+ services, 5+ steps, or when the user explicitly asks you to plan.

The plan will be shown to the user for approval before execution. Each step should be a concrete action.

Do NOT use this for simple tasks — just execute those directly.`,
      inputSchema: z.object({
        title: z.string().describe('Short title for the plan, e.g., "Weekly Status Report from PostHog + Linear + Slack"'),
        steps: z.array(z.object({
          id: z.string().describe('Unique step ID like "step-1", "step-2"'),
          description: z.string().describe('What to do in this step — be specific'),
          tool_hint: z.string().nullable().describe('Which tool/service to use, or null if no tool needed'),
        })).describe('Ordered list of steps to complete the task'),
      }),
      execute: async ({ title, steps }) => {
        const plan = await createPlan(supabase, {
          thread_id: threadId,
          org_id: orgId,
          title,
          steps: steps.map(s => ({
            ...s,
            status: 'pending' as const,
            output: null,
          })),
        });

        if (!plan) return { created: false, error: 'Failed to create plan' };

        return {
          created: true,
          planId: plan.id,
          title: plan.title,
          stepCount: plan.steps.length,
          message: `Plan created: "${title}" with ${plan.steps.length} steps. Waiting for user approval.`,
          steps: plan.steps.map(s => ({ id: s.id, description: s.description })),
        };
      },
    }),

    execute_plan: tool({
      description: `Execute an approved plan step by step. Only call this after the user has approved the plan. The plan must have status 'approved'.`,
      inputSchema: z.object({
        planId: z.string().describe('The plan ID to execute'),
      }),
      execute: async ({ planId }) => {
        const plan = await getPlan(supabase, planId);
        if (!plan) return { error: 'Plan not found' };
        if (plan.status !== 'approved') {
          return { error: `Plan is in "${plan.status}" status. It must be approved before execution.` };
        }

        await updatePlanStatus(supabase, planId, 'executing');

        // Return the plan details so the model can execute each step
        return {
          executing: true,
          planId: plan.id,
          title: plan.title,
          steps: plan.steps,
          instructions: 'Execute each step in order. After completing each step, report what you did. If a step fails, decide whether to skip it, retry, or abort the plan.',
        };
      },
    }),

    update_plan_step: tool({
      description: `Update the status and output of a plan step during execution. Call this after completing each step.`,
      inputSchema: z.object({
        planId: z.string().describe('The plan ID'),
        stepId: z.string().describe('The step ID to update'),
        status: z.enum(['done', 'failed', 'skipped']).describe('New status for the step'),
        output: z.string().optional().describe('Summary of what was done or why it failed'),
      }),
      execute: async ({ planId, stepId, status, output }) => {
        await updatePlanStep(supabase, planId, stepId, { status, output: output || null });

        // Check if all steps are done
        const plan = await getPlan(supabase, planId);
        if (!plan) return { updated: true };

        const allDone = plan.steps.every(s => s.status === 'done' || s.status === 'failed' || s.status === 'skipped');
        if (allDone) {
          const anyFailed = plan.steps.some(s => s.status === 'failed');
          await updatePlanStatus(supabase, planId, anyFailed ? 'failed' : 'completed');
          return { updated: true, planCompleted: true, finalStatus: anyFailed ? 'failed' : 'completed' };
        }

        return { updated: true, planCompleted: false };
      },
    }),
  };
}
```

- [ ] **Step 2: Register planning tools in engine**

In `src/modules/agent/engine.ts`, add import:
```typescript
import { createPlanningTools } from '@/modules/planning/tools';
```

In `createAgentStream`, after the orchestration tools block, add:
```typescript
    if (input.threadId) {
      const planningTools = createPlanningTools(input.supabase, input.orgId, input.threadId);
      Object.assign(builtInTools, planningTools);
    }
```

- [ ] **Step 3: Add planning guidance to system prompt**

In `src/modules/agent/engine.ts`, add to `SYSTEM_PROMPT` after the Scheduling section:

```typescript
## Planning
For complex tasks (3+ services, 5+ steps, or ambiguous scope), use create_plan to propose a structured plan.
Present it to the user and wait for their approval before executing.
For simple tasks (single lookup, quick action), just do them directly — no plan needed.

Before planning complex tasks, identify what's ambiguous. Ask 1-2 targeted questions if the request could be interpreted multiple ways. Don't over-ask — if intent is clear, plan and execute.
For scheduled tasks, never ask questions — the prompt is the runbook.
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: planning tools — create_plan, execute_plan, update_plan_step"
```

---

### Task 4: Plan Approval Server Action

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Add plan approval action**

In `src/app/actions.ts`, add:

```typescript
export async function approvePlanAction(planId: string) {
  const { supabase } = await getAuthContext();
  const { updatePlanStatus } = await import('@/modules/planning/db');

  await updatePlanStatus(supabase, planId, 'approved');
  return { success: true };
}

export async function cancelPlanAction(planId: string) {
  const { supabase } = await getAuthContext();
  const { updatePlanStatus } = await import('@/modules/planning/db');

  await updatePlanStatus(supabase, planId, 'failed');
  return { success: true };
}

export async function getPlanAction(planId: string) {
  const { supabase } = await getAuthContext();
  const { getPlan } = await import('@/modules/planning/db');

  return getPlan(supabase, planId);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat: plan approval/cancel server actions"
```

---

### Task 5: PlanView Component

**Files:**
- Create: `src/components/chat/PlanView.tsx`
- Modify: `src/components/chat/ChatMessages.tsx`

- [ ] **Step 1: Create PlanView component**

Create `src/components/chat/PlanView.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2Icon, CircleIcon, Loader2Icon, XCircleIcon, SkipForwardIcon } from 'lucide-react';
import { approvePlanAction, cancelPlanAction, getPlanAction } from '@/app/actions';
import type { Plan, PlanStep } from '@/lib/types';

function StepIcon({ status }: { status: PlanStep['status'] }) {
  switch (status) {
    case 'done': return <CheckCircle2Icon className="size-4 text-green-500" />;
    case 'running': return <Loader2Icon className="size-4 text-blue-500 animate-spin" />;
    case 'failed': return <XCircleIcon className="size-4 text-red-500" />;
    case 'skipped': return <SkipForwardIcon className="size-4 text-muted-foreground" />;
    default: return <CircleIcon className="size-4 text-muted-foreground" />;
  }
}

interface PlanViewProps {
  planId: string;
  initialPlan?: {
    title: string;
    steps: Array<{ id: string; description: string }>;
  };
}

export function PlanView({ planId, initialPlan }: PlanViewProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPlanAction(planId).then(p => {
      if (p) setPlan(p);
    });

    // Poll for updates while executing
    const interval = setInterval(async () => {
      const p = await getPlanAction(planId);
      if (p) {
        setPlan(p);
        if (p.status === 'completed' || p.status === 'failed') {
          clearInterval(interval);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [planId]);

  const handleApprove = async () => {
    setLoading(true);
    await approvePlanAction(planId);
    const p = await getPlanAction(planId);
    if (p) setPlan(p);
    setLoading(false);
  };

  const handleCancel = async () => {
    setLoading(true);
    await cancelPlanAction(planId);
    const p = await getPlanAction(planId);
    if (p) setPlan(p);
    setLoading(false);
  };

  const steps = plan?.steps || initialPlan?.steps?.map(s => ({ ...s, status: 'pending' as const, output: null, tool_hint: null })) || [];
  const title = plan?.title || initialPlan?.title || 'Plan';
  const status = plan?.status || 'draft';

  return (
    <Card className="mt-2">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-sm">{title}</p>
          <span className="text-xs text-muted-foreground capitalize">{status}</span>
        </div>

        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-start gap-2 text-sm">
              <StepIcon status={(step as PlanStep).status || 'pending'} />
              <div className="flex-1">
                <p className={(step as PlanStep).status === 'done' ? 'text-muted-foreground' : ''}>
                  {i + 1}. {step.description}
                </p>
                {(step as PlanStep).output && (
                  <p className="text-xs text-muted-foreground mt-0.5">{(step as PlanStep).output}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {status === 'draft' && (
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={loading}>
              {loading ? 'Approving...' : 'Approve & Execute'}
            </Button>
          </div>
        )}

        {status === 'completed' && (
          <p className="text-xs text-green-600 mt-3">Plan completed successfully</p>
        )}
        {status === 'failed' && (
          <p className="text-xs text-red-600 mt-3">Plan failed or was cancelled</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render PlanView in ChatMessages**

In `src/components/chat/ChatMessages.tsx`, add import:
```typescript
import { PlanView } from './PlanView';
```

In the `AssistantParts` function, in the section that renders text parts, add plan detection before the `MessageResponse` rendering:

```typescript
    if (part.type === 'text' && part.text) {
      // Check if the text contains a plan reference (from create_plan tool output)
      const planMatch = part.text.match(/planId["\s:]+["']?([a-f0-9-]{36})["']?/);
      if (planMatch) {
        elements.push(
          <PlanView key={`plan-${i}`} planId={planMatch[1]} />
        );
      }
```

Note: This is a heuristic — the plan ID is embedded in the tool's output text. A cleaner approach would use data parts, but this works for the initial implementation.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: PlanView component — approve/cancel plans, live step progress"
```
