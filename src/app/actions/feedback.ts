'use server';

import { getAuthContext } from './helpers';

export async function submitFeedbackAction(messageId: string, rating: 'positive' | 'negative', comment?: string) {
  const { supabase, user } = await getAuthContext();

  const { error } = await supabase.from('message_feedback').upsert({
    message_id: messageId,
    user_id: user.id,
    rating,
    comment,
  }, { onConflict: 'message_id,user_id' });

  if (error) return { error: 'Failed to save feedback' };
  return { success: true };
}
