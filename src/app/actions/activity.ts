'use server';

import { getAuthContext } from './helpers';

export async function getActivityAction(limit: number = 50) {
  const { supabase, orgId } = await getAuthContext();

  const { data } = await supabase
    .from('activity')
    .select('*, threads(title)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}
