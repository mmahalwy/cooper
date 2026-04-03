/**
 * Background task tool — lets Cooper offload complex work to Inngest.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { inngest } from '@/inngest/client';
import { createBackgroundJob } from '@/modules/background/db';

export function createBackgroundTools(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId: string,
  connectedServices: string[]
) {
  return {
    start_background_task: tool({
      description: `Start a complex task in the background. Use when the task has 3+ steps, involves multiple integrations, or will take more than a minute. You'll respond to the user immediately, and post progress updates to this conversation as each step completes.

Examples of tasks to background:
- "Analyze PostHog data and post a report to Slack"
- "Research competitors across multiple sources"
- "Check all integrations and summarize status"

Do NOT background simple single-step tasks — just do those inline.`,
      inputSchema: z.object({
        goal: z.string().describe('What the user wants accomplished'),
        steps: z.array(z.object({
          id: z.string().describe('Unique step ID like "step-1"'),
          action: z.string().describe('What to do in this step — be specific'),
          integration: z.string().nullable().describe('Which service to use (slack, posthog, etc.), or null for analysis/synthesis'),
        })).min(2).max(15),
      }),
      execute: async ({ goal, steps }) => {
        try {
          const job = await createBackgroundJob(supabase, {
            org_id: orgId,
            user_id: userId,
            thread_id: threadId,
            goal,
            steps: steps.map(s => ({ ...s, status: 'pending' as const, output: null })),
          });

          if (!job) return { started: false, error: 'Failed to create background job' };

          // Send Inngest event to start execution
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
            message: `Working on "${goal}" in the background. I'll post updates here as each step completes. 🚀`,
          };
        } catch (error) {
          return { started: false, error: String(error) };
        }
      },
    }),
  };
}
