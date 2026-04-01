import { createServiceClient } from '@/lib/supabase/service';
import { claimDueTasksForDispatch } from '@/modules/scheduler/db';
import { executeScheduledTask } from '@/modules/scheduler/executor';
import type { ScheduledTask } from '@/lib/types';

export const maxDuration = 300;

const CONCURRENCY_LIMIT = 5;

async function executeWithConcurrency(
  tasks: ScheduledTask[],
  executor: (task: ScheduledTask) => Promise<void>
): Promise<{ executed: number; errors: number }> {
  let executed = 0;
  let errors = 0;

  for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
    const batch = tasks.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.allSettled(
      batch.map((task) => executor(task))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        executed++;
      } else {
        errors++;
        console.error(`[cron] Task failed:`, result.reason);
      }
    }
  }

  return { executed, errors };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceClient();

  let dueTasks: ScheduledTask[];
  try {
    dueTasks = await claimDueTasksForDispatch(supabase);
  } catch (error) {
    console.error('[cron] Failed to fetch due tasks:', error);
    return Response.json({ error: 'Failed to fetch due tasks' }, { status: 500 });
  }

  console.log(`[cron] Found ${dueTasks.length} due tasks`);

  if (dueTasks.length === 0) {
    return Response.json({ executed: 0 });
  }

  const { executed, errors } = await executeWithConcurrency(
    dueTasks,
    (task) => {
      console.log(`[cron] Executing task: ${task.name} (${task.id.slice(0, 8)})`);
      return executeScheduledTask(supabase, task);
    }
  );

  console.log(`[cron] Completed: ${executed} executed, ${errors} errors out of ${dueTasks.length} total`);
  return Response.json({ executed, errors, total: dueTasks.length });
}
