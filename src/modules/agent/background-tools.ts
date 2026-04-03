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
      description: `Start a massive, multi-phase project in the background. RARELY use this — only for work that would take 10+ minutes with many steps. Think "project, not task."

Examples: full competitive analysis across 10 companies, quarterly data audit with visualizations, company-wide status report from all channels.

Do NOT use for anything that can be done with a few tool calls — fetching data, sending messages, creating documents, or quick summaries should all run inline.`,
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
