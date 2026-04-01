'use server';

import { getAuthContext } from './helpers';

export async function checkOnboardingAction() {
  const { supabase, user } = await getAuthContext();
  const { data } = await supabase
    .from('users')
    .select('name, timezone, onboarding_completed_at')
    .eq('id', user.id)
    .single();
  return {
    completed: !!data?.onboarding_completed_at,
    name: data?.name,
    timezone: data?.timezone,
  };
}

export async function completeOnboardingAction(updates: { name: string; timezone: string }) {
  const { supabase, user } = await getAuthContext();
  await supabase
    .from('users')
    .update({
      name: updates.name,
      timezone: updates.timezone,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  return { success: true };
}
