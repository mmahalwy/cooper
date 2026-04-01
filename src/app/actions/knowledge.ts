'use server';

import { revalidatePath } from 'next/cache';
import { addKnowledge, deleteKnowledge } from '@/modules/memory/knowledge';
import { getAuthContext } from './helpers';

export async function addKnowledgeAction(content: string) {
  const { supabase, orgId } = await getAuthContext();
  const fact = await addKnowledge(supabase, orgId, content);
  if (!fact) return { error: 'Failed to add knowledge' };
  revalidatePath('/knowledge');
  return { success: true, fact };
}

export async function deleteKnowledgeAction(id: string) {
  const { supabase } = await getAuthContext();
  const success = await deleteKnowledge(supabase, id);
  if (!success) return { error: 'Failed to delete' };
  revalidatePath('/knowledge');
  return { success: true };
}
