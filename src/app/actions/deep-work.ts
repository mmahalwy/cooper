'use server';

import { getAuthContext } from './helpers';

export async function getDeepWorkStatusAction(threadId: string) {
  const { supabase, orgId } = await getAuthContext();
  const { getDeepWorkProgress } = await import('@/modules/agent/deep-work');
  return getDeepWorkProgress(supabase, orgId, threadId);
}
