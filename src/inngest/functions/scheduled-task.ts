/**
 * Inngest functions for scheduled task execution.
 * Replaces the cron dispatch endpoint.
 */

import { inngest } from '../client';
import { createServiceClient } from '@/lib/supabase/service';
import {
  claimDueTasksForDispatch,
  updateTaskAfterRun,
  updateScheduledTaskStatus,
  resetTaskFailures,
  recordTaskFailure,
} from '@/modules/scheduler/db';
import { executeScheduledTask } from '@/modules/scheduler/executor';
import { getNextRunTime } from '@/modules/scheduler/matcher';

/**
 * Cron checker — runs every minute, finds due tasks, dispatches them.
 */
export const scheduledTaskChecker = inngest.createFunction(
  { id: 'cooper-scheduled-checker', triggers: [{ cron: '* * * * *' }] },
  async ({ step }) => {
    const supabase = createServiceClient();

    const dueTasks = await step.run('check-due', async () => {
      const tasks = await claimDueTasksForDispatch(supabase);
      console.log(`[inngest-scheduler] Found ${tasks.length} due tasks`);
      return tasks;
    });

    if (dueTasks.length === 0) return { executed: 0 };

    // Send individual events for each due task
    const events = dueTasks.map((task) => ({
      name: 'cooper/scheduled-task' as const,
      data: { taskId: task.id },
    }));

    await step.sendEvent('dispatch-tasks', events);

    return { dispatched: dueTasks.length };
  }
);

/**
 * Scheduled task executor — runs a single scheduled task.
 */
export const scheduledTaskExecutor = inngest.createFunction(
  { id: 'cooper-scheduled-task', retries: 2, triggers: [{ event: 'cooper/scheduled-task' }] },
  async ({ event, step }) => {
    const { taskId } = event.data;
    const supabase = createServiceClient();

    await step.run('execute', async () => {
      try {
        // The existing executeScheduledTask handles everything:
        // expiry check, thread creation, tool loading, execution,
        // message saving, usage tracking, rolling summary, failure tracking
        const { data: task } = await supabase
          .from('scheduled_tasks')
          .select('*')
          .eq('id', taskId)
          .single();

        if (!task) {
          console.error(`[inngest-scheduler] Task ${taskId} not found`);
          return;
        }

        await executeScheduledTask(supabase, task);
      } catch (error) {
        console.error(`[inngest-scheduler] Task ${taskId} failed:`, error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await recordTaskFailure(supabase, taskId, errorMsg);
      }
    });
  }
);
