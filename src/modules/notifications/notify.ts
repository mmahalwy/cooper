import { SupabaseClient } from '@supabase/supabase-js';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export async function sendNotification(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | null,
  title: string,
  body?: string,
  opts?: { type?: NotificationType; threadId?: string },
): Promise<void> {
  await supabase.from('notifications').insert({
    org_id: orgId,
    user_id: userId,
    title,
    body,
    type: opts?.type || 'info',
    thread_id: opts?.threadId,
  });
}
