'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from './helpers';

export async function getPersonaAction() {
  const { supabase, orgId } = await getAuthContext();
  const { data } = await supabase
    .from('organizations')
    .select('persona_name, persona_instructions, persona_tone')
    .eq('id', orgId)
    .single();
  return data || { persona_name: 'Cooper', persona_instructions: '', persona_tone: 'professional' };
}

export async function updatePersonaAction(updates: { persona_name?: string; persona_instructions?: string; persona_tone?: string }) {
  const { supabase, orgId } = await getAuthContext();
  const { error } = await supabase.from('organizations').update(updates).eq('id', orgId);
  if (error) return { error: 'Failed to update persona' };
  revalidatePath('/settings/persona');
  return { success: true };
}
