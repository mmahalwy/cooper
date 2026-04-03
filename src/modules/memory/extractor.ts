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
    scope: z.enum(['org', 'user']).describe('Is this fact about the whole org, or specific to this user?'),
  })).describe('Facts worth remembering. Empty array if nothing new to learn.'),
});

/**
 * Extract learnable facts from a conversation exchange.
 * Runs in the background after each assistant response.
 *
 * Facts scoped to 'user' are stored with userId so they can be retrieved
 * and personalized per individual. Facts scoped to 'org' are shared across
 * the whole organization.
 */
export async function extractAndSaveMemories(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  userMessage: string,
  assistantResponse: string,
  existingKnowledge: string[]
): Promise<void> {
  try {
    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: extractionSchema,
      prompt: `You are a highly selective memory system for an AI teammate. Extract ONLY facts that would help the AI work better with this user in FUTURE conversations.

## Already known:
${existingKnowledge.length > 0 ? existingKnowledge.map((k) => `- ${k}`).join('\n') : '(none yet)'}

## Conversation:
User: ${userMessage}
Assistant: ${assistantResponse}

## ONLY extract facts about:
- Organization structure (team names, roles, who reports to whom) → scope: org
- Processes and workflows ("deploys require 2 PR approvals", "sprint is 2 weeks") → scope: org
- Tool preferences shared across the team ("we use Linear for issues") → scope: org
- Naming conventions, technical stack, infrastructure details → scope: org
- THIS USER's personal preferences ("prefers bullet points", "works in Pacific time") → scope: user
- THIS USER's individual habits or working style → scope: user

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
    // semantic similarity so duplicates are skipped or merged automatically.
    // User-scoped facts are tagged with userId for per-user retrieval.
    for (const fact of result.object.facts) {
      const factUserId = fact.scope === 'user' ? userId : undefined;
      const saved = await addKnowledge(supabase, orgId, fact.content, 'conversation', factUserId);
      if (saved) {
        const scopeLabel = fact.scope === 'user' ? `[user:${userId.slice(0, 8)}]` : '[org]';
        console.log(`[memory] Saved ${scopeLabel} fact: "${fact.content.slice(0, 60)}..."`);
      }
    }
  } catch (error) {
    // Non-critical — don't break the chat flow
    console.error('[memory] Extraction failed:', error);
  }
}
