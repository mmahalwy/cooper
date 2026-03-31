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
