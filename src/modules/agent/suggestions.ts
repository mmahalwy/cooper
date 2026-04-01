/**
 * Proactive suggestions — generate follow-up ideas after task completion.
 * 
 * Used in the background pipeline to store suggestions that the UI
 * can surface as quick-action buttons or prompts.
 */

import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    text: z.string().describe('The suggestion text as a natural sentence'),
    type: z.enum(['schedule', 'investigate', 'notify', 'expand', 'share']).describe('Category of suggestion'),
    prompt: z.string().describe('The full prompt to send if the user clicks this suggestion'),
  })).max(3).describe('0-3 follow-up suggestions. Empty if not appropriate.'),
});

export type Suggestion = z.infer<typeof suggestionsSchema>['suggestions'][number];

/**
 * Generate follow-up suggestions after a substantive response.
 * Returns empty array for simple Q&A or when suggestions aren't appropriate.
 */
export async function generateSuggestions(
  userMessage: string,
  assistantResponse: string,
  toolsUsed: string[],
  connectedServices: string[],
): Promise<Suggestion[]> {
  // Skip suggestions for simple interactions
  if (toolsUsed.length === 0 && assistantResponse.length < 200) {
    return [];
  }

  try {
    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: suggestionsSchema,
      prompt: `You are generating follow-up suggestions for an AI teammate called Cooper. Based on this interaction, suggest 0-3 actionable next steps.

## User asked:
${userMessage.slice(0, 500)}

## Cooper responded (summary):
${assistantResponse.slice(0, 1000)}

## Tools used:
${toolsUsed.join(', ') || 'none'}

## Connected services:
${connectedServices.join(', ') || 'none'}

## Rules:
- Only suggest things Cooper can actually do with available tools/services
- Suggestions should feel like a proactive teammate offering to help more
- Common patterns: scheduling recurring versions of one-off tasks, investigating anomalies, setting up notifications, sharing results with the team
- Return EMPTY array if the conversation is casual, a greeting, or the task is clearly complete with no natural follow-up
- Each suggestion needs a full 'prompt' field that Cooper can execute directly`,
    });

    return result.object.suggestions;
  } catch (error) {
    console.error('[suggestions] Failed:', error);
    return [];
  }
}
