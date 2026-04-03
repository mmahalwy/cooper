import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from './embeddings';

export interface KnowledgeFact {
  id: string;
  org_id: string;
  user_id?: string | null;
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
    .select('id, org_id, user_id, content, source, created_at, updated_at')
    .eq('org_id', orgId)
    .is('user_id', null)           // only org-wide facts
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[knowledge] Failed to load:', error);
    return [];
  }

  return data as KnowledgeFact[];
}

export async function getKnowledgeForUser(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<KnowledgeFact[]> {
  const { data, error } = await supabase
    .from('knowledge')
    .select('id, org_id, user_id, content, source, created_at, updated_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[knowledge] Failed to load user knowledge:', error);
    return [];
  }
  return data as KnowledgeFact[];
}

export async function addKnowledge(
  supabase: SupabaseClient,
  orgId: string,
  content: string,
  source: 'user' | 'conversation' = 'user',
  userId?: string,
): Promise<KnowledgeFact | null> {
  const embedding = await embeddingProvider.embed(content);

  // Check for semantic duplicates before inserting.
  // Scope duplicate check to the same user (or org-wide when no userId).
  const { data: similar } = await supabase.rpc('match_knowledge', {
    query_embedding: embedding,
    match_org_id: orgId,
    match_count: 1,
    match_threshold: 0.70,
    match_user_id: userId || null,
  });

  if (similar && similar.length > 0) {
    const topMatch = similar[0];

    if (topMatch.similarity >= 0.85) {
      // Near-duplicate — skip insert, return existing
      console.log(
        `[knowledge] Skipping duplicate (${topMatch.similarity.toFixed(2)} similarity): "${content.slice(0, 50)}..."`
      );
      return {
        id: topMatch.id,
        org_id: orgId,
        user_id: userId || null,
        content: topMatch.content,
        source: topMatch.source || source,
        created_at: '',
        updated_at: '',
      } as KnowledgeFact;
    }

    // Moderate similarity (0.80–0.90) — update existing fact with refined content
    console.log(
      `[knowledge] Updating similar fact (${topMatch.similarity.toFixed(2)} similarity): "${content.slice(0, 50)}..."`
    );
    return updateKnowledge(supabase, topMatch.id, content, embedding);
  }

  // No similar fact found — insert new
  const { data, error } = await supabase
    .from('knowledge')
    .insert({
      org_id: orgId,
      user_id: userId || null,
      content,
      source,
      embedding,
    })
    .select('id, org_id, user_id, content, source, created_at, updated_at')
    .single();

  if (error) {
    console.error('[knowledge] Failed to add:', error);
    return null;
  }

  return data as KnowledgeFact;
}

export async function updateKnowledge(
  supabase: SupabaseClient,
  knowledgeId: string,
  content: string,
  embedding?: number[]
): Promise<KnowledgeFact | null> {
  const emb = embedding || (await embeddingProvider.embed(content));

  const { data, error } = await supabase
    .from('knowledge')
    .update({
      content,
      embedding: emb,
      updated_at: new Date().toISOString(),
    })
    .eq('id', knowledgeId)
    .select('id, org_id, user_id, content, source, created_at, updated_at')
    .single();

  if (error) {
    console.error('[knowledge] Failed to update:', error);
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
