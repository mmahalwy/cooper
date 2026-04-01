/**
 * Agent-facing tools for the background task queue.
 *
 * `queue_background_task` — lets the agent offload long-running work.
 * `check_task_status`     — lets the agent (or user) check progress.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { enqueueTask, getTasksForThread } from './queue';

export function createTaskTools(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId?: string,
) {
  return {
    queue_background_task: tool({
      description: `Queue a task for background processing. Use this when:
- A task will take more than 30 seconds to complete
- You need to run a complex multi-step workflow
- The user asks you to "work on this and get back to me"
- You need to process large amounts of data
- You need to call many tools in sequence and don't want the user to wait

The task will be processed asynchronously and the result will appear in the conversation when done.
Write a detailed, self-contained prompt — the background worker has no access to conversation history.`,
      inputSchema: z.object({
        prompt: z.string().describe(
          'Detailed, self-contained instructions for the background task. Include all context needed — the worker cannot see this conversation.',
        ),
        type: z
          .enum(['agent', 'code_execution', 'report', 'data_processing'])
          .default('agent')
          .describe('Task category'),
      }),
      execute: async ({ prompt, type }) => {
        const task = await enqueueTask(supabase, {
          orgId,
          userId,
          threadId,
          type,
          prompt,
        });

        if (!task) {
          return { queued: false, error: 'Failed to queue task' };
        }

        return {
          queued: true,
          taskId: task.id,
          message:
            'Task queued for background processing. Results will appear in this conversation when complete.',
        };
      },
    }),

    check_task_status: tool({
      description:
        'Check the status of background tasks in this conversation. Shows queued, running, completed, and failed tasks.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!threadId) {
          return { tasks: [], message: 'No thread context — cannot look up tasks.' };
        }

        const tasks = await getTasksForThread(supabase, threadId);
        if (tasks.length === 0) {
          return { tasks: [], message: 'No background tasks found for this conversation.' };
        }

        return {
          tasks: tasks.map((t) => ({
            id: t.id,
            type: t.type,
            status: t.status,
            prompt: t.prompt.slice(0, 100) + (t.prompt.length > 100 ? '…' : ''),
            result: t.result?.slice(0, 200),
            error: t.error,
            createdAt: t.created_at,
            completedAt: t.completed_at,
          })),
          message: `Found ${tasks.length} background task(s).`,
        };
      },
    }),
  };
}
