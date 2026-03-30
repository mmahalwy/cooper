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
    description: `Create a scheduled recurring task. Use this when the user asks you to do something on a regular cadence.

IMPORTANT: The "prompt" field is the FULL set of instructions that a future AI agent will follow when executing this task. The agent running the task will have NO other context — it won't know the original conversation. The prompt must be completely self-contained and highly detailed.

A good prompt includes:
1. **What to do** — Clear objective and step-by-step instructions
2. **How to do it** — Specific API calls, tool names, data sources, query patterns
3. **What to include** — Exact sections, metrics, data points to cover
4. **How to format** — Output structure, formatting rules, channel/destination details
5. **Edge cases** — What to do if data is missing, how to handle errors, what to flag
6. **Comparisons** — Week-over-week, trend analysis, benchmarks to include

Think of it as writing a detailed runbook that someone could follow with zero context. The more specific the prompt, the better the output.

Example: If the user says "every Tuesday post an incident report to Slack", the prompt should specify: which API to query, what fields to extract, how to structure the report (summary, metrics, deep dives), formatting rules (emoji, Slack markdown), what to compare (week-over-week), and where to post.`,
    inputSchema: z.object({
      name: z.string().describe('Short descriptive name, e.g., "Weekly Incident Report"'),
      cron: z.string().describe('Cron expression (5 fields: minute hour day-of-month month day-of-week, UTC). Examples: "0 9 * * 1" = Monday 9am UTC, "0 12 * * 2" = Tuesday 12pm UTC, "0 14 * * 1-5" = weekdays 2pm UTC'),
      prompt: z.string().describe('Comprehensive, self-contained instructions for the AI agent that will execute this task. Must include: objective, step-by-step process, data sources, output format, sections to include, formatting rules, edge cases, and delivery details. Write this as a detailed runbook — 200-500 words minimum.'),
      humanReadable: z.string().describe('Human-readable schedule description, e.g., "Every Tuesday at 12:00 PM UTC"'),
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
