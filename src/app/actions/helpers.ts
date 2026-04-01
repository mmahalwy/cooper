'use server';

import { createClient } from '@/lib/supabase/server';

export async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) throw new Error('User not found');

  return { supabase, user, orgId: dbUser.org_id };
}
