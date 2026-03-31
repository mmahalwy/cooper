import { createServiceClient } from '@/lib/supabase/service';
import { getDueTasksForDispatch } from '@/modules/scheduler/db';
import { executeScheduledTask } from '@/modules/scheduler/executor';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceClient();
  const dueTasks = await getDueTasksForDispatch(supabase);

  console.log(`[cron] Found ${dueTasks.length} due tasks`);

  if (dueTasks.length === 0) {
    return Response.json({ executed: 0 });
  }

  let executed = 0;
  let errors = 0;

  for (const task of dueTasks) {
    try {
      console.log(`[cron] Executing task: ${task.name} (${task.id.slice(0, 8)})`);
      await executeScheduledTask(supabase, task);
      executed++;
    } catch (error) {
      errors++;
      console.error(`[cron] Failed to execute task ${task.id}:`, error);
    }
  }

  return Response.json({ executed, errors, total: dueTasks.length });
}
