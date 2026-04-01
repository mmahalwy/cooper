/**
 * Automatic memory extraction — runs after each conversation turn.
 * Analyzes the conversation and extracts durable facts without explicit tool calls.
 */

import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { addKnowledge } from './knowledge';

const extractionSchema = z.object({
  facts: z.array(z.object({
    content: z.string().describe('A clear, standalone factual statement'),
    category: z.enum(['process', 'preference', 'team', 'tool', 'project', 'context']).describe('Category of the fact'),
  })).describe('Facts worth remembering. Empty array if nothing new to learn.'),
});

/**
 * Extract learnable facts from a conversation exchange.
 * Runs in the background after each assistant response.
 */
export async function extractAndSaveMemories(
  supabase: SupabaseClient,
  orgId: string,
  userMessage: string,
  assistantResponse: string,
  existingKnowledge: string[]
): Promise<void> {
  try {
    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: extractionSchema,
      prompt: `You are a highly selective memory system for an AI teammate. Extract ONLY organizational facts that would help the AI work better with this user in FUTURE conversations.

## Already known:
${existingKnowledge.length > 0 ? existingKnowledge.map((k) => `- ${k}`).join('\n') : '(none yet)'}

## Conversation:
User: ${userMessage}
Assistant: ${assistantResponse}

## ONLY extract facts about:
- Organization structure (team names, roles, who reports to whom)
- Processes and workflows ("deploys require 2 PR approvals", "sprint is 2 weeks")
- Tool preferences ("we use Linear for issues", "main repo is acme/core")
- Naming conventions, technical stack, infrastructure details
- User preferences for how they like work delivered

## NEVER extract:
- What the user asked or what the assistant responded (that's conversation history, not knowledge)
- Meeting contents, summaries, or notes from tools like Granola
- Data retrieved from connected tools (PostHog metrics, Sentry errors, etc.)
- One-time requests or questions
- Things already known (check the list above)
- Anything about the assistant's capabilities or connections
- Vague or obvious facts ("the user uses Cooper")

## Return an empty array for most conversations. Only 1 in 5 exchanges should yield a fact.`,
    });

    if (result.object.facts.length === 0) return;

    console.log(
      `[memory] Extracted ${result.object.facts.length} candidate facts, dedup will run on save`
    );

    // Save each extracted fact — addKnowledge handles deduplication via
    // semantic similarity so duplicates are skipped or merged automatically
    for (const fact of result.object.facts) {
      const saved = await addKnowledge(supabase, orgId, fact.content, 'conversation');
      if (saved) {
        console.log(`[memory] Saved fact: "${fact.content.slice(0, 60)}..."`);
      }
    }
  } catch (error) {
    // Non-critical — don't break the chat flow
    console.error('[memory] Extraction failed:', error);
  }
}
