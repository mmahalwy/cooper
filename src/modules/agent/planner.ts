import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createPlan, getPlan, updatePlanStatus, updatePlanStep } from '@/modules/planning/db';

export function createPlanningTools(supabase: SupabaseClient, orgId: string, threadId: string) {
  return {
    plan_task: tool({
      description: `Create an execution plan before starting complex work. Use this when:
- The user's request involves 3+ steps or multiple services
- You need to gather information from multiple sources
- The task requires careful sequencing
- You want to show the user your approach before diving in

The plan will be saved and shown to the user. For simple tasks, just do them directly — no plan needed.`,
      inputSchema: z.object({
        title: z.string().describe('Short title for the plan'),
        steps: z
          .array(
            z.object({
              id: z.string().describe('Unique step ID like "step-1"'),
              description: z.string().describe('What to do in this step'),
              tool_hint: z.string().nullable().describe('Which tool/service to use, or null'),
            }),
          )
          .min(2)
          .max(10),
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

        if (!plan) return { planned: false, error: 'Failed to create plan' };

        return {
          planned: true,
          planId: plan.id,
          title: plan.title,
          stepCount: plan.steps.length,
          message: `Plan "${title}" created with ${plan.steps.length} steps. Waiting for approval before executing.`,
          steps: plan.steps.map(s => ({ id: s.id, description: s.description })),
        };
      },
    }),

    execute_plan: tool({
      description: `Execute an approved plan. Only call this after the user has approved the plan. The plan must have status 'approved'.`,
      inputSchema: z.object({
        planId: z.string().describe('The plan ID to execute'),
      }),
      execute: async ({ planId }) => {
        const plan = await getPlan(supabase, planId);
        if (!plan) return { error: 'Plan not found' };
        if (plan.status !== 'approved') {
          return { error: `Plan is "${plan.status}". It must be approved before execution.` };
        }

        await updatePlanStatus(supabase, planId, 'executing');

        return {
          executing: true,
          planId: plan.id,
          title: plan.title,
          steps: plan.steps,
          instructions: 'Execute each step in order. After each step, call update_plan_step with the result. If a step fails, decide whether to skip, retry, or abort.',
        };
      },
    }),

    update_plan_step: tool({
      description: 'Update the status and output of a plan step during execution. Call after completing each step.',
      inputSchema: z.object({
        planId: z.string().describe('The plan ID'),
        stepId: z.string().describe('The step ID to update'),
        status: z.enum(['done', 'failed', 'skipped']).describe('New status'),
        note: z.string().optional().describe('Summary of what was done or why it failed'),
      }),
      execute: async ({ planId, stepId, status, note }) => {
        await updatePlanStep(supabase, planId, stepId, { status, output: note || null });

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
