/**
 * Memory tools — let Cooper proactively learn and recall knowledge.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { addKnowledge, getKnowledgeForOrg, getKnowledgeForUser, deleteKnowledge } from './knowledge';
import { embeddingProvider } from './embeddings';

/**
 * Create memory tools — save, list, and forget knowledge.
 */
export function createMemoryTools(supabase: SupabaseClient, orgId: string, userId?: string) {
  return {
    save_knowledge: createSaveKnowledgeTool(supabase, orgId, userId),
    list_knowledge: tool({
      description: `List knowledge Cooper has learned. Shows personal facts (specific to you) and org-wide facts separately. Use when the user asks "what do you know about me/us", "what knowledge do you have", or wants to see stored memories.`,
      inputSchema: z.object({}),
      execute: async () => {
        const [orgFacts, userFacts] = await Promise.all([
          getKnowledgeForOrg(supabase, orgId),
          userId ? getKnowledgeForUser(supabase, orgId, userId) : Promise.resolve([]),
        ]);

        if (orgFacts.length === 0 && userFacts.length === 0) {
          return {
            personal: [],
            organization: [],
            message: "I haven't learned any specific facts about you or your organization yet. As we work together, I'll pick up important details automatically.",
          };
        }

        return {
          personal: userFacts.map(f => ({ content: f.content, learnedAt: f.created_at })),
          organization: orgFacts.map(f => ({ content: f.content, source: f.source, learnedAt: f.created_at })),
          message: `${userFacts.length} personal fact(s), ${orgFacts.length} org-wide fact(s).`,
        };
      },
    }),
    forget_knowledge: tool({
      description: `Forget (delete) a saved fact. Use when the user says "forget that", "that's no longer true", or asks to remove specific stored information. Search by the fact content.`,
      inputSchema: z.object({
        content: z.string().describe('The fact to forget — should match or closely paraphrase the stored fact.'),
      }),
      execute: async ({ content }) => {
        try {
          // Find the closest matching fact using semantic search
          const embedding = await embeddingProvider.embed(content);
          const { data: matches } = await supabase.rpc('match_knowledge', {
            query_embedding: embedding,
            match_org_id: orgId,
            match_count: 1,
            match_threshold: 0.70,
            match_user_id: userId || null,
          });

          if (!matches || matches.length === 0) {
            return { deleted: false, message: `No matching fact found for: "${content}"` };
          }

          const match = matches[0];
          const success = await deleteKnowledge(supabase, match.id);
          if (success) {
            return { deleted: true, message: `Forgotten: "${match.content}"` };
          }
          return { deleted: false, error: 'Failed to delete' };
        } catch (error) {
          return { deleted: false, error: String(error) };
        }
      },
    }),
  };
}

/**
 * Create a save_knowledge tool bound to a specific org and optional user.
 * Cooper uses this to remember facts it learns during conversations.
 */
export function createSaveKnowledgeTool(supabase: SupabaseClient, orgId: string, userId?: string) {
  return tool({
    description: `Save an important fact to memory. Use scope='me' for facts specific to this user (preferences, habits, working style). Use scope='org' for facts about the whole organization (processes, tooling, team structure).`,
    inputSchema: z.object({
      fact: z.string().describe('The fact to remember as a clear, standalone statement.'),
      scope: z.enum(['me', 'org']).default('org').describe("'me' = personal to this user, 'org' = applies to the whole organization"),
    }),
    execute: async ({ fact, scope }) => {
      try {
        const factUserId = scope === 'me' ? userId : undefined;
        const result = await addKnowledge(supabase, orgId, fact, 'conversation', factUserId);
        if (result) {
          const scopeLabel = scope === 'me' ? 'personal preference' : 'org fact';
          return { saved: true, fact, scope, message: `Remembered as ${scopeLabel}: "${fact}"` };
        }
        return { saved: false, error: 'Failed to save knowledge' };
      } catch (error) {
        return { saved: false, error: String(error) };
      }
    },
  });
}
