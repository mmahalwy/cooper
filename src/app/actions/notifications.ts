'use server';

import { getAuthContext } from './helpers';

export async function getNotificationsAction() {
  const { supabase, user, orgId } = await getAuthContext();
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .or(`user_id.eq.${user.id},and(user_id.is.null,org_id.eq.${orgId})`)
    .order('created_at', { ascending: false })
    .limit(30);
  return data || [];
}

export async function markNotificationReadAction(notificationId: string) {
  const { supabase } = await getAuthContext();
  await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
}

export async function markAllNotificationsReadAction() {
  const { supabase, user } = await getAuthContext();
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
}
