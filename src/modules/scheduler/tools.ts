/**
 * Scheduler tools — let Cooper create/manage scheduled tasks from chat.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { createScheduledTask } from './db';
import { getNextRunTime } from './matcher';

export function createScheduleTool(supabase: SupabaseClient, orgId: string, userId: string) {
  return tool({
    description: `Create a scheduled recurring task. Use this when the user asks you to do something on a regular cadence — e.g., "every Monday at 9am summarize my PRs", "every Tuesday at 12pm post a health check to Slack". Parse the schedule into a cron expression and save it. The task will run automatically at the specified times.`,
    inputSchema: z.object({
      name: z.string().describe('Short name for the task, e.g., "Weekly PR Summary"'),
      cron: z.string().describe('Cron expression (5 fields: minute hour day-of-month month day-of-week, UTC). Examples: "0 9 * * 1" = Monday 9am, "0 12 * * 2" = Tuesday 12pm, "0 14 * * 1-5" = weekdays 2pm'),
      prompt: z.string().describe('The full prompt that will be sent to the AI agent each time the task runs. Be specific and include all details the agent needs.'),
      humanReadable: z.string().describe('Human-readable description of the schedule, e.g., "Every Tuesday at 12:00 PM UTC"'),
    }),
    execute: async ({ name, cron, prompt, humanReadable }) => {
      try {
        const nextRunAt = getNextRunTime(cron).toISOString();

        const task = await createScheduledTask(supabase, {
          org_id: orgId,
          user_id: userId,
          name,
          cron,
          prompt,
          next_run_at: nextRunAt,
        });

        if (!task) {
          return { created: false, error: 'Failed to create scheduled task' };
        }

        return {
          created: true,
          name,
          schedule: humanReadable,
          cron,
          nextRun: nextRunAt,
          message: `Scheduled "${name}" — ${humanReadable}. Next run: ${new Date(nextRunAt).toLocaleString()}.`,
        };
      } catch (error) {
        return { created: false, error: String(error) };
      }
    },
  });
}
