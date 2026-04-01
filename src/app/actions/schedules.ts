'use server';

import { revalidatePath } from 'next/cache';
import {
  createScheduledTask,
  deleteScheduledTask,
  updateScheduledTaskStatus,
} from '@/modules/scheduler/db';
import { getNextRunTime } from '@/modules/scheduler/matcher';
import { parseScheduleFromNL } from '@/modules/scheduler/parser';
import { getAuthContext } from './helpers';

export async function parseScheduleAction(description: string) {
  await getAuthContext();
  return await parseScheduleFromNL(description);
}

export async function createScheduleAction(schedule: {
  name: string;
  cron: string;
  prompt: string;
}) {
  const { supabase, user, orgId } = await getAuthContext();

  let nextRunAt: string;
  try {
    nextRunAt = getNextRunTime(schedule.cron).toISOString();
  } catch {
    return { error: 'Invalid cron expression' };
  }

  const task = await createScheduledTask(supabase, {
    org_id: orgId,
    user_id: user.id,
    ...schedule,
    next_run_at: nextRunAt,
  });
  if (!task) return { error: 'Failed to create schedule' };
  revalidatePath('/schedules');
  return { success: true, task };
}

export async function toggleScheduleAction(id: string, status: 'active' | 'paused') {
  const { supabase } = await getAuthContext();
  await updateScheduledTaskStatus(supabase, id, status);
  revalidatePath('/schedules');
  return { success: true };
}

export async function deleteScheduleAction(id: string) {
  const { supabase } = await getAuthContext();
  const success = await deleteScheduledTask(supabase, id);
  if (!success) return { error: 'Failed to delete' };
  revalidatePath('/schedules');
  return { success: true };
}

export async function getScheduleRunsAction(taskId: string) {
  const { supabase } = await getAuthContext();
  const { data } = await supabase
    .from('threads')
    .select('id, title, created_at')
    .eq('scheduled_task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(20);
  return data || [];
}
