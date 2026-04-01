/**
 * Activity tracking — logs what Cooper does for visibility.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type ActivityAction =
  | 'tool_call'
  | 'schedule_run'
  | 'memory_stored'
  | 'skill_created'
  | 'thread_created'
  | 'error';

export async function logActivity(
  supabase: SupabaseClient,
  orgId: string,
  action: ActivityAction,
  description: string,
  metadata?: {
    threadId?: string;
    userId?: string;
    toolName?: string;
    error?: string;
    [key: string]: unknown;
  },
): Promise<void> {
  try {
    await supabase.from('activity').insert({
      org_id: orgId,
      thread_id: metadata?.threadId,
      user_id: metadata?.userId,
      action,
      description,
      metadata: metadata || {},
    });
  } catch (error) {
    console.error('[activity] Failed to log:', error);
  }
}
