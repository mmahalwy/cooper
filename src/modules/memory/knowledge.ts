import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from './embeddings';

export interface KnowledgeFact {
  id: string;
  org_id: string;
  content: string;
  source: 'user' | 'conversation' | 'system';
  created_at: string;
  updated_at: string;
}

export async function getKnowledgeForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<KnowledgeFact[]> {
  const { data, error } = await supabase
    .from('knowledge')
    .select('id, org_id, content, source, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[knowledge] Failed to load:', error);
    return [];
  }

  return data as KnowledgeFact[];
}

export async function addKnowledge(
  supabase: SupabaseClient,
  orgId: string,
  content: string,
  source: 'user' | 'conversation' = 'user'
): Promise<KnowledgeFact | null> {
  const embedding = await embeddingProvider.embed(content);

  const { data, error } = await supabase
    .from('knowledge')
    .insert({
      org_id: orgId,
      content,
      source,
      embedding,
    })
    .select('id, org_id, content, source, created_at, updated_at')
    .single();

  if (error) {
    console.error('[knowledge] Failed to add:', error);
    return null;
  }

  return data as KnowledgeFact;
}

export async function deleteKnowledge(
  supabase: SupabaseClient,
  knowledgeId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('knowledge')
    .delete()
    .eq('id', knowledgeId);

  if (error) {
    console.error('[knowledge] Failed to delete:', error);
    return false;
  }
  return true;
}
