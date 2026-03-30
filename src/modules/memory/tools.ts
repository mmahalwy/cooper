/**
 * Memory tools — let Cooper proactively learn and recall knowledge.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { addKnowledge } from './knowledge';

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
