/**
 * Self-reflection — evaluate response quality after complex tool chains.
 * 
 * Only triggers when:
 * - 3+ tool calls were made (indicates complex work)
 * - Response is non-trivial (50+ chars)
 * 
 * Returns a quality assessment that can inform the next interaction.
 */

import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const reflectionSchema = z.object({
  quality: z.enum(['good', 'needs-improvement', 'poor']).describe('Overall quality assessment'),
  completeness: z.boolean().describe('Did the response fully address the request?'),
  issues: z.array(z.string()).describe('Specific issues found, if any'),
  suggestion: z.string().optional().describe('What Cooper should do differently next time'),
});

export type ReflectionResult = z.infer<typeof reflectionSchema>;

/**
 * Evaluate the quality of Cooper's response.
 * Returns null if reflection isn't needed (simple responses).
 */
export async function reflectOnResponse(
  userMessage: string,
  assistantResponse: string,
  toolsUsed: string[],
): Promise<ReflectionResult | null> {
  // Only reflect on complex interactions
  if (toolsUsed.length < 3 || assistantResponse.length < 50) {
    return null;
  }

  try {
    const result = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: reflectionSchema,
      prompt: `You are a quality reviewer for an AI assistant called Cooper. Evaluate whether this response adequately addresses the user's request.

## User asked:
${userMessage.slice(0, 1000)}

## Cooper responded:
${assistantResponse.slice(0, 3000)}

## Tools used:
${toolsUsed.join(', ')}

## Evaluate:
1. **Completeness** — Did Cooper answer the full question? Are there parts left unanswered?
2. **Accuracy** — Does the response make factual claims that aren't supported by tool results?
3. **Format** — Is it well-organized, scannable, and appropriately concise?
4. **Actionability** — If the user asked for analysis, did Cooper provide insights and recommendations, not just raw data?

Be generous — mark "good" unless there are clear issues. Most responses should be "good".`,
    });

    return result.object;
  } catch (error) {
    console.error('[reflection] Failed:', error);
    return null;
  }
}
