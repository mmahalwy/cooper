import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from './embeddings';

export interface MemoryContext {
  knowledge: string[];
  matchedSkills: Array<{
    name: string;
    description: string;
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
  userMessage: string
): Promise<MemoryContext> {
  const context: MemoryContext = {
    knowledge: [],
    matchedSkills: [],
    threadSummaries: [],
  };

  try {
    const queryEmbedding = await embeddingProvider.embed(userMessage);

    const [knowledgeResult, skillsResult, threadResult] = await Promise.all([
      supabase.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        match_org_id: orgId,
        match_count: 5,
        match_threshold: 0.65,
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
      context.knowledge = knowledgeResult.data.map((k: any) => k.content);
    }

    if (skillsResult.data) {
      context.matchedSkills = skillsResult.data.map((s: any) => ({
        name: s.name,
        description: s.description,
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
