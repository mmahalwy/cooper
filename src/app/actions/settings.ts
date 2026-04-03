'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from './helpers';

export async function getSettingsAction() {
  const { supabase, user, orgId } = await getAuthContext();

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('organizations').select('*').eq('id', orgId).single(),
  ]);

  return { profile, org };
}

export async function updateProfileAction(updates: { name?: string; timezone?: string; model_preference?: string }) {
  const { supabase, user } = await getAuthContext();

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id);

  if (error) return { error: 'Failed to update profile' };
  revalidatePath('/settings');
  return { success: true };
}

export async function updateOrgAction(updates: { name?: string; model_preference?: string }) {
  const { supabase, orgId } = await getAuthContext();

  const { error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', orgId);

  if (error) return { error: 'Failed to update organization' };
  revalidatePath('/settings');
  return { success: true };
}
