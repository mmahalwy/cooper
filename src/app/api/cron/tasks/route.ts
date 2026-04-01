/**
 * Cron endpoint that drains the background task queue.
 *
 * Vercel cron hits this route on a regular cadence. Each invocation
 * processes up to `MAX_TASKS_PER_RUN` tasks sequentially, staying
 * well within the 5-minute function timeout.
 */

import { createServiceClient } from '@/lib/supabase/service';
import { processNextTask } from '@/modules/tasks/worker';

export const maxDuration = 300; // 5 minutes — Vercel Pro limit

const MAX_TASKS_PER_RUN = 5;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceClient();

  let processed = 0;

  while (processed < MAX_TASKS_PER_RUN) {
    const hadTask = await processNextTask(supabase);
    if (!hadTask) break;
    processed++;
  }

  console.log(`[cron/tasks] Processed ${processed} background task(s)`);
  return Response.json({ processed });
}
