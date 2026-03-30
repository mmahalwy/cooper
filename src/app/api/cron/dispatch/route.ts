import { createClient } from '@/lib/supabase/server';
import { getDueTasksForDispatch } from '@/modules/scheduler/db';
import { executeScheduledTask } from '@/modules/scheduler/executor';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = await createClient();
  const dueTasks = await getDueTasksForDispatch(supabase);

  if (dueTasks.length === 0) {
    return Response.json({ executed: 0 });
  }

  let executed = 0;
  let errors = 0;

  for (const task of dueTasks) {
    try {
      await executeScheduledTask(supabase, task);
      executed++;
    } catch (error) {
      errors++;
      console.error(`[cron] Failed to execute task ${task.id}:`, error);
    }
  }

  return Response.json({ executed, errors, total: dueTasks.length });
}
