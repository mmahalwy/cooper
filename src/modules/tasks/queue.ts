/**
 * Background task queue — enqueue, claim, complete, and query tasks.
 *
 * Tasks are written to `background_tasks` by the agent and picked up
 * by the cron worker (`/api/cron/tasks`).
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface BackgroundTask {
  id: string;
  org_id: string;
  user_id: string;
  thread_id?: string;
  type: string;
  status: string;
  prompt: string;
  result?: string;
  error?: string;
  metadata: Record<string, unknown>;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Insert a new task into the queue with status 'queued'.
 */
export async function enqueueTask(
  supabase: SupabaseClient,
  task: {
    orgId: string;
    userId: string;
    threadId?: string;
    type: string;
    prompt: string;
    metadata?: Record<string, unknown>;
  },
): Promise<BackgroundTask | null> {
  const { data, error } = await supabase
    .from('background_tasks')
    .insert({
      org_id: task.orgId,
      user_id: task.userId,
      thread_id: task.threadId,
      type: task.type,
      prompt: task.prompt,
      metadata: task.metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error('[tasks] Failed to enqueue:', error);
    return null;
  }

  return data;
}

/**
 * Atomically claim the oldest queued task by updating it to 'running'.
 * Returns null when the queue is empty.
 */
export async function claimNextTask(
  supabase: SupabaseClient,
): Promise<BackgroundTask | null> {
  const { data, error } = await supabase
    .from('background_tasks')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .select()
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Mark a task as successfully completed.
 */
export async function completeTask(
  supabase: SupabaseClient,
  taskId: string,
  result: string,
) {
  const { error } = await supabase
    .from('background_tasks')
    .update({
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) console.error(`[tasks] Failed to complete task ${taskId}:`, error);
}

/**
 * Mark a task as failed.
 */
export async function failTask(
  supabase: SupabaseClient,
  taskId: string,
  error: string,
) {
  const { error: dbError } = await supabase
    .from('background_tasks')
    .update({
      status: 'failed',
      error,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (dbError) console.error(`[tasks] Failed to record failure for ${taskId}:`, dbError);
}

/**
 * List tasks associated with a thread (most recent first).
 */
export async function getTasksForThread(
  supabase: SupabaseClient,
  threadId: string,
): Promise<BackgroundTask[]> {
  const { data } = await supabase
    .from('background_tasks')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false });

  return data || [];
}

/**
 * Cancel all queued (not yet running) tasks for a thread.
 */
export async function cancelQueuedTasks(
  supabase: SupabaseClient,
  threadId: string,
) {
  await supabase
    .from('background_tasks')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('status', 'queued');
}
