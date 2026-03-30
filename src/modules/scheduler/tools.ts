/**
 * Scheduler tools — let Cooper create, list, update, and delete scheduled tasks from chat.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  createScheduledTask,
  getScheduledTasksForOrg,
  updateScheduledTask,
  deleteScheduledTask,
} from './db';
import { getNextRunTime } from './matcher';

export function createScheduleTools(supabase: SupabaseClient, orgId: string, userId: string) {
  return {
    create_schedule: tool({
      description: `Create a scheduled recurring task. Use this when the user asks you to do something on a regular cadence.

IMPORTANT: The "prompt" field is the FULL set of instructions that a future AI agent will follow when executing this task. The agent running the task will have NO other context — it won't know the original conversation. The prompt must be completely self-contained and highly detailed.

A good prompt includes:
1. **What to do** — Clear objective and step-by-step instructions
2. **How to do it** — Specific API calls, tool names, data sources, query patterns
3. **What to include** — Exact sections, metrics, data points to cover
4. **How to format** — Output structure, formatting rules, channel/destination details
5. **Edge cases** — What to do if data is missing, how to handle errors, what to flag
6. **Comparisons** — Week-over-week, trend analysis, benchmarks to include

Think of it as writing a detailed runbook that someone could follow with zero context.`,
      inputSchema: z.object({
        name: z.string().describe('Short descriptive name, e.g., "Weekly Incident Report"'),
        cron: z.string().describe('Cron expression (5 fields: minute hour day-of-month month day-of-week, UTC)'),
        prompt: z.string().describe('Comprehensive, self-contained runbook for the AI agent. 200-500 words minimum.'),
        humanReadable: z.string().describe('Human-readable schedule, e.g., "Every Tuesday at 12:00 PM UTC"'),
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

          if (!task) return { created: false, error: 'Failed to create scheduled task' };

          return {
            created: true,
            taskId: task.id,
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
    }),

    list_schedules: tool({
      description: 'List all scheduled tasks for the current organization. Use this when the user asks about their schedules, wants to see what\'s running, or when you need to find a specific schedule to update or delete.',
      inputSchema: z.object({}),
      execute: async () => {
        const tasks = await getScheduledTasksForOrg(supabase, orgId);
        if (tasks.length === 0) {
          return { schedules: [], message: 'No scheduled tasks found.' };
        }
        return {
          schedules: tasks.map((t) => ({
            id: t.id,
            name: t.name,
            cron: t.cron,
            status: t.status,
            prompt: t.prompt.slice(0, 200) + (t.prompt.length > 200 ? '...' : ''),
            lastRun: t.last_run_at,
            nextRun: t.next_run_at,
          })),
          message: `Found ${tasks.length} scheduled task(s).`,
        };
      },
    }),

    update_schedule: tool({
      description: `Update an existing scheduled task. Use this when the user wants to change the schedule, prompt, name, or status of an existing task. First use list_schedules to find the task ID, then update it.

You can update any combination of: name, cron schedule, prompt (the runbook), or status (active/paused).
When updating the prompt, regenerate the FULL detailed runbook — don't just patch a sentence.
When updating the cron, also recalculate and include the new next_run_at.`,
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the scheduled task to update'),
        name: z.string().optional().describe('New name for the task'),
        cron: z.string().optional().describe('New cron expression'),
        prompt: z.string().optional().describe('New full runbook prompt — must be comprehensive and self-contained'),
        status: z.enum(['active', 'paused']).optional().describe('New status'),
        humanReadable: z.string().optional().describe('Human-readable description of the new schedule'),
      }),
      execute: async ({ taskId, name, cron, prompt, status, humanReadable }) => {
        try {
          const updates: Record<string, any> = {};
          if (name) updates.name = name;
          if (cron) {
            updates.cron = cron;
            updates.next_run_at = getNextRunTime(cron).toISOString();
          }
          if (prompt) updates.prompt = prompt;
          if (status) updates.status = status;

          const task = await updateScheduledTask(supabase, taskId, updates);
          if (!task) return { updated: false, error: 'Failed to update — task not found or permission denied' };

          return {
            updated: true,
            taskId: task.id,
            name: task.name,
            cron: task.cron,
            status: task.status,
            nextRun: task.next_run_at,
            message: `Updated "${task.name}"${humanReadable ? ` — now runs ${humanReadable}` : ''}.`,
          };
        } catch (error) {
          return { updated: false, error: String(error) };
        }
      },
    }),

    delete_schedule: tool({
      description: 'Delete a scheduled task permanently. Use list_schedules first to find the task ID. Confirm with the user before deleting.',
      inputSchema: z.object({
        taskId: z.string().describe('The ID of the scheduled task to delete'),
      }),
      execute: async ({ taskId }) => {
        const success = await deleteScheduledTask(supabase, taskId);
        if (!success) return { deleted: false, error: 'Failed to delete — task not found or permission denied' };
        return { deleted: true, message: 'Schedule deleted.' };
      },
    }),
  };
}
