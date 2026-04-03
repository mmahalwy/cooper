import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from './embeddings';

export interface MemoryContext {
  knowledge: string[];        // ALL knowledge combined (backward compat for existing callers)
  orgKnowledge: string[];     // org-wide facts only (user_id IS NULL)
  userKnowledge: string[];    // user-specific facts only (user_id IS NOT NULL)
  matchedSkills: Array<{
    id: string;
    name: string;
    description: string;
    trigger: string;
    steps: unknown[];
    tools: string[];
    outputFormat?: string;
  }>;
  threadSummaries: Array<{
    threadId: string;
    summary: string;
  }>;
}

export async function retrieveContext(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | undefined,
  userMessage: string
): Promise<MemoryContext> {
  const context: MemoryContext = {
    knowledge: [],
    orgKnowledge: [],
    userKnowledge: [],
    matchedSkills: [],
    threadSummaries: [],
  };

  try {
    const queryEmbedding = await embeddingProvider.embed(userMessage);

    const [knowledgeResult, skillsResult, threadResult] = await Promise.all([
      // Pass userId so the query returns both user-specific and org-wide facts.
      // When userId is undefined (e.g. scheduled tasks), falls back to org-wide only.
      supabase.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        match_org_id: orgId,
        match_count: 5,
        match_threshold: 0.65,
        match_user_id: userId || null,
      }),
      supabase.rpc('match_skills', {
        query_embedding: queryEmbedding,
        match_org_id: orgId,
        match_count: 3,
        match_threshold: 0.55,
      }),
      supabase.rpc('match_thread_summaries', {
        query_embedding: queryEmbedding,
        match_org_id: orgId,
        match_count: 3,
        match_threshold: 0.60,
      }),
    ]);

    if (knowledgeResult.data) {
      const orgFacts = knowledgeResult.data.filter((k: any) => !k.user_id).map((k: any) => k.content);
      const userFacts = knowledgeResult.data.filter((k: any) => k.user_id).map((k: any) => k.content);
      context.orgKnowledge = orgFacts;
      context.userKnowledge = userFacts;
      context.knowledge = [...userFacts, ...orgFacts]; // user facts first (more personalized)
    }

    if (skillsResult.data) {
      context.matchedSkills = skillsResult.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        trigger: s.trigger,
        steps: s.steps,
        tools: s.tools,
        outputFormat: s.output_format,
      }));
    }

    if (threadResult.data) {
      context.threadSummaries = threadResult.data.map((t: any) => ({
        threadId: t.thread_id,
        summary: t.summary,
      }));
    }
  } catch (error) {
    console.error('[retriever] Failed to retrieve context:', error);
  }

  return context;
}
