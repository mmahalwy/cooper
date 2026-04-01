import { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduledTask, ExecutionLog } from '@/lib/types';

export async function getScheduledTasksForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<ScheduledTask[]> {
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[scheduler] Failed to load tasks:', error);
    return [];
  }
  return data as ScheduledTask[];
}

export async function createScheduledTask(
  supabase: SupabaseClient,
  task: {
    org_id: string;
    user_id: string;
    name: string;
    cron: string;
    prompt: string;
    skill_id?: string;
    channel_config?: { channel: 'web' | 'slack'; destination?: string };
    next_run_at: string;
    ends_at?: string;
  }
): Promise<ScheduledTask | null> {
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .insert({
      ...task,
      channel_config: task.channel_config || { channel: 'web' },
    })
    .select('*')
    .single();

  if (error) {
    console.error('[scheduler] Failed to create task:', error);
    return null;
  }
  return data as ScheduledTask;
}

export async function updateScheduledTask(
  supabase: SupabaseClient,
  taskId: string,
  updates: Partial<Pick<ScheduledTask, 'name' | 'cron' | 'prompt' | 'status' | 'next_run_at'>>
): Promise<ScheduledTask | null> {
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) {
    console.error('[scheduler] Failed to update task:', error);
    return null;
  }
  return data as ScheduledTask;
}

export async function updateScheduledTaskStatus(
  supabase: SupabaseClient,
  taskId: string,
  status: 'active' | 'paused'
): Promise<void> {
  await supabase
    .from('scheduled_tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId);
}

export async function deleteScheduledTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('scheduled_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('[scheduler] Failed to delete task:', error);
    return false;
  }
  return true;
}

export async function getDueTasksForDispatch(
  supabase: SupabaseClient
): Promise<ScheduledTask[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[scheduler] Failed to get due tasks:', error);
    return [];
  }
  return data as ScheduledTask[];
}

export async function updateTaskAfterRun(
  supabase: SupabaseClient,
  taskId: string,
  nextRunAt: string
): Promise<void> {
  await supabase
    .from('scheduled_tasks')
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: nextRunAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

export async function createExecutionLog(
  supabase: SupabaseClient,
  log: {
    task_id: string;
    thread_id?: string;
    status: 'running' | 'success' | 'error';
    output?: string;
    error_message?: string;
    duration_ms?: number;
    tokens_used?: number;
  }
): Promise<ExecutionLog | null> {
  const { data, error } = await supabase
    .from('execution_logs')
    .insert({
      ...log,
      completed_at: log.status !== 'running' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[scheduler] Failed to create execution log:', error);
    return null;
  }
  return data as ExecutionLog;
}

export async function getExecutionLogsForTask(
  supabase: SupabaseClient,
  taskId: string,
  limit = 10
): Promise<ExecutionLog[]> {
  const { data, error } = await supabase
    .from('execution_logs')
    .select('*')
    .eq('task_id', taskId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[scheduler] Failed to load logs:', error);
    return [];
  }
  return data as ExecutionLog[];
}

/** Atomically claim due tasks by setting locked_until */
export async function claimDueTasksForDispatch(
  supabase: SupabaseClient,
  lockDurationMinutes: number = 5
): Promise<ScheduledTask[]> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + lockDurationMinutes * 60 * 1000);
  
  // Get due tasks that aren't locked
  const { data: dueTasks, error: fetchError } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now.toISOString())
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .order('next_run_at', { ascending: true })
    .limit(20);

  if (fetchError || !dueTasks || dueTasks.length === 0) {
    if (fetchError) console.error('[scheduler] Failed to get due tasks:', fetchError);
    return [];
  }

  // Lock them
  const taskIds = dueTasks.map(t => t.id);
  const { error: lockError } = await supabase
    .from('scheduled_tasks')
    .update({ locked_until: lockUntil.toISOString() })
    .in('id', taskIds);

  if (lockError) {
    console.error('[scheduler] Failed to lock tasks:', lockError);
    return [];
  }

  return dueTasks as ScheduledTask[];
}

/** Clear the lock on a task after execution */
export async function clearTaskLock(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  await supabase
    .from('scheduled_tasks')
    .update({ locked_until: null })
    .eq('id', taskId);
}

/** Record a failure and auto-pause after too many consecutive failures */
export async function recordTaskFailure(
  supabase: SupabaseClient,
  taskId: string,
  errorMessage?: string,
  maxConsecutiveFailures: number = 3
): Promise<boolean> {
  // Increment consecutive_failures
  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('consecutive_failures, name, org_id, user_id')
    .eq('id', taskId)
    .single();

  if (error || !data) return false;

  const newCount = (data.consecutive_failures || 0) + 1;

  if (newCount >= maxConsecutiveFailures) {
    // Auto-pause the task
    await supabase
      .from('scheduled_tasks')
      .update({
        consecutive_failures: newCount,
        status: 'paused',
        failure_reason: errorMessage || 'Unknown error',
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    console.warn(`[scheduler] Task ${taskId} auto-paused after ${newCount} consecutive failures`);

    // Notify the user by inserting a message in their most recent non-scheduled thread
    const { data: recentThread } = await supabase
      .from('threads')
      .select('id')
      .eq('org_id', data.org_id)
      .is('scheduled_task_id', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (recentThread) {
      await supabase.from('messages').insert({
        thread_id: recentThread.id,
        role: 'assistant',
        content: `⚠️ Your scheduled task "${data.name}" has been paused after ${newCount} consecutive failures.\n\nLast error: ${errorMessage || 'Unknown error'}\n\nYou can resume it from the Schedules page after investigating the issue.`,
        metadata: { system_notification: true, task_id: taskId },
      });
    }

    return true; // was paused
  } else {
    await supabase
      .from('scheduled_tasks')
      .update({
        consecutive_failures: newCount,
        failure_reason: errorMessage || null,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    return false; // not paused yet
  }
}

/** Reset consecutive failures after a successful run */
export async function resetTaskFailures(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  await supabase
    .from('scheduled_tasks')
    .update({ consecutive_failures: 0, locked_until: null })
    .eq('id', taskId);
}
