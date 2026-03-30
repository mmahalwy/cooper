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
      prompt: `You are a memory extraction system. Analyze this conversation exchange and extract any durable facts worth remembering for future conversations.

## Already known facts:
${existingKnowledge.length > 0 ? existingKnowledge.map((k) => `- ${k}`).join('\n') : '(none yet)'}

## Conversation:
User: ${userMessage}
Assistant: ${assistantResponse}

## Rules:
- Only extract DURABLE facts useful across many future conversations
- Do NOT extract: trivial info, one-time requests, greetings, opinions, things already known
- Focus on: team processes, tool preferences, project details, names/roles, organizational context, workflow patterns, technical stack details
- Write each fact as a clear standalone statement (e.g., "The team uses Linear for issue tracking" not "They use Linear")
- If nothing new is worth remembering, return an empty array
- Be selective — quality over quantity. 0-3 facts per exchange is typical.`,
    });

    if (result.object.facts.length === 0) return;

    // Save each extracted fact
    for (const fact of result.object.facts) {
      await addKnowledge(supabase, orgId, fact.content, 'conversation');
    }

    if (result.object.facts.length > 0) {
      console.log(`[memory] Extracted ${result.object.facts.length} facts: ${result.object.facts.map((f) => f.content).join('; ')}`);
    }
  } catch (error) {
    // Non-critical — don't break the chat flow
    console.error('[memory] Extraction failed:', error);
  }
}
