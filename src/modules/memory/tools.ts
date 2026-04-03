/**
 * Memory tools — let Cooper proactively learn and recall knowledge.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { addKnowledge, getKnowledgeForOrg } from './knowledge';

/**
 * Create memory tools — save and list knowledge.
 */
export function createMemoryTools(supabase: SupabaseClient, orgId: string) {
  return {
    save_knowledge: createSaveKnowledgeTool(supabase, orgId),
    list_knowledge: tool({
      description: `List all knowledge and facts Cooper has learned about the user and their organization. Use this when the user asks "what do you know about me/us", "what knowledge do you have", or wants to see stored memories.`,
      inputSchema: z.object({}),
      execute: async () => {
        const facts = await getKnowledgeForOrg(supabase, orgId);
        if (facts.length === 0) {
          return {
            facts: [],
            message: "I haven't learned any specific facts about you or your organization yet. As we work together, I'll pick up important details automatically.",
          };
        }
        return {
          facts: facts.map(f => ({ content: f.content, source: f.source, learnedAt: f.created_at })),
          count: facts.length,
          message: `I know ${facts.length} thing(s) about your organization.`,
        };
      },
    }),
  };
}

/**
 * Create a save_knowledge tool bound to a specific org.
 * Cooper uses this to remember facts it learns during conversations.
 */
export function createSaveKnowledgeTool(supabase: SupabaseClient, orgId: string) {
  return tool({
    description: `Save an important fact about the user or their organization to memory. Use this when you learn something worth remembering for future conversations — like team processes, preferences, tool configurations, project details, or organizational context. Ask the user for confirmation before saving. Examples: "Our deploy process requires 2 PR approvals", "Sprint cycle is 2 weeks starting Monday", "We use Linear for issue tracking".`,
    inputSchema: z.object({
      fact: z.string().describe('The fact to remember. Write it as a clear, standalone statement.'),
    }),
    execute: async ({ fact }) => {
      try {
        const result = await addKnowledge(supabase, orgId, fact, 'conversation');
        if (result) {
          return { saved: true, fact, message: `Remembered: "${fact}"` };
        }
        return { saved: false, error: 'Failed to save knowledge' };
      } catch (error) {
        return { saved: false, error: String(error) };
      }
    },
  });
}
