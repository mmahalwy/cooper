import { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduledTask, ExecutionLog } from '@/lib/types';

const MAX_CONSECUTIVE_FAILURES = 3;

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

/**
 * Atomically fetch due tasks and lock them to prevent duplicate execution.
 * Sets locked_until to 5 minutes from now. Only picks tasks that are
 * unlocked (locked_until IS NULL or lock has expired).
 */
export async function getDueTasksForDispatch(
  supabase: SupabaseClient
): Promise<ScheduledTask[]> {
  const now = new Date().toISOString();
  const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Use rpc to perform atomic SELECT ... FOR UPDATE SKIP LOCKED pattern
  const { data, error } = await supabase.rpc('acquire_due_tasks', {
    p_now: now,
    p_lock_until: lockUntil,
    p_limit: 20,
  });

  if (error) {
    console.error('[scheduler] Failed to acquire due tasks, falling back to non-atomic query:', error);
    // Fallback: use standard query with lock check (less safe but functional)
    return getDueTasksForDispatchFallback(supabase);
  }

  return (data ?? []) as ScheduledTask[];
}

/**
 * Fallback query for environments where the RPC is not yet deployed.
 * Filters out already-locked tasks but does not atomically lock them.
 */
async function getDueTasksForDispatchFallback(
  supabase: SupabaseClient
): Promise<ScheduledTask[]> {
  const now = new Date().toISOString();
  const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .order('next_run_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[scheduler] Fallback query failed:', error);
    return [];
  }

  const tasks = (data ?? []) as ScheduledTask[];

  // Best-effort lock: update all fetched tasks
  if (tasks.length > 0) {
    const taskIds = tasks.map((t) => t.id);
    await supabase
      .from('scheduled_tasks')
      .update({ locked_until: lockUntil })
      .in('id', taskIds);
  }

  return tasks;
}

/**
 * Clear the lock on a task after execution completes (success or failure).
 */
export async function clearTaskLock(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  const { error } = await supabase
    .from('scheduled_tasks')
    .update({ locked_until: null })
    .eq('id', taskId);

  if (error) {
    console.error(`[scheduler] Failed to clear lock for task ${taskId}:`, error);
  }
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
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

/**
 * Reset consecutive failure counter on successful execution.
 */
export async function resetConsecutiveFailures(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  await supabase
    .from('scheduled_tasks')
    .update({ consecutive_failures: 0 })
    .eq('id', taskId);
}

/**
 * Increment consecutive failure counter. If the threshold is reached,
 * auto-pause the task and return true.
 */
export async function recordTaskFailure(
  supabase: SupabaseClient,
  taskId: string
): Promise<{ paused: boolean; failures: number }> {
  // Increment the counter
  const { data, error } = await supabase
    .rpc('increment_consecutive_failures', { p_task_id: taskId });

  if (error) {
    console.error(`[scheduler] Failed to increment failure counter for ${taskId}:`, error);
    // Fallback: read current value and update manually
    return recordTaskFailureFallback(supabase, taskId);
  }

  const newCount = data as number;

  if (newCount >= MAX_CONSECUTIVE_FAILURES) {
    console.warn(
      `[scheduler] Task ${taskId} has ${newCount} consecutive failures, auto-pausing`
    );
    await supabase
      .from('scheduled_tasks')
      .update({
        status: 'paused',
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    return { paused: true, failures: newCount };
  }

  return { paused: false, failures: newCount };
}

/**
 * Fallback for failure recording when the RPC is not available.
 */
async function recordTaskFailureFallback(
  supabase: SupabaseClient,
  taskId: string
): Promise<{ paused: boolean; failures: number }> {
  const { data: task } = await supabase
    .from('scheduled_tasks')
    .select('consecutive_failures')
    .eq('id', taskId)
    .single();

  const currentFailures = (task?.consecutive_failures ?? 0) as number;
  const newCount = currentFailures + 1;

  const updates: Record<string, unknown> = {
    consecutive_failures: newCount,
    updated_at: new Date().toISOString(),
  };

  if (newCount >= MAX_CONSECUTIVE_FAILURES) {
    console.warn(
      `[scheduler] Task ${taskId} has ${newCount} consecutive failures, auto-pausing`
    );
    updates.status = 'paused';
    updates.locked_until = null;
  }

  await supabase
    .from('scheduled_tasks')
    .update(updates)
    .eq('id', taskId);

  return { paused: newCount >= MAX_CONSECUTIVE_FAILURES, failures: newCount };
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
