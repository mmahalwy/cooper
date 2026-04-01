/**
 * Orchestration tools — let Cooper break complex tasks into parallel subtasks.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { executeSubtasks, type SubtaskDefinition } from './subtask';

export function createOrchestrationTools(supabase: SupabaseClient, orgId: string) {
  return {
    run_subtasks: tool({
      description: `Break a complex task into parallel subtasks and execute them concurrently. Use this when:
- You need to gather information from multiple sources (e.g., check PostHog AND Linear AND GitHub)
- A task has independent parts that can run simultaneously
- You need to compare or aggregate data from different tools
- The user asks for a comprehensive report covering multiple areas

Each subtask runs as an independent agent with access to all connected tools.
After all subtasks complete, you'll receive their outputs to synthesize into a final response.

Tips:
- Keep subtask prompts specific and self-contained
- Each subtask should produce a clear, structured output
- 2-5 subtasks is the sweet spot — don't over-parallelize`,
      inputSchema: z.object({
        subtasks: z.array(z.object({
          id: z.string().describe('Short identifier, e.g., "posthog-metrics"'),
          description: z.string().describe('Brief description of what this subtask does'),
          prompt: z.string().describe('Detailed, self-contained prompt for this subtask. Include what to look up, how to format the output, and any specific details.'),
        })).min(2).max(10).describe('List of subtasks to execute in parallel'),
      }),
      execute: async ({ subtasks }) => {
        try {
          console.log(`[orchestration] Starting ${subtasks.length} subtasks`);
          const results = await executeSubtasks(
            subtasks as SubtaskDefinition[],
            supabase,
            orgId,
          );

          const succeeded = results.filter(r => r.status === 'success');
          const failed = results.filter(r => r.status !== 'success');
          const totalTokens = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);

          return {
            completed: results.length,
            succeeded: succeeded.length,
            failed: failed.length,
            totalTokens,
            results: results.map(r => ({
              id: r.id,
              description: r.description,
              status: r.status,
              output: r.output,
              durationMs: r.durationMs,
            })),
          };
        } catch (error) {
          return {
            completed: 0,
            succeeded: 0,
            failed: subtasks.length,
            error: String(error),
            results: [],
          };
        }
      },
    }),
  };
}
