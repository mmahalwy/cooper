import { z } from 'zod';
import type { UIMessage } from 'ai';

/**
 * Custom data part types sent through the AI SDK stream.
 * These appear as `data-suggestions` parts on UIMessage.
 */
export type ChatDataParts = {
  suggestions: SuggestionData[];
};

export type SuggestionData = {
  text: string;
  type: 'schedule' | 'investigate' | 'notify' | 'expand' | 'share';
  prompt: string;
};

export const suggestionsPartSchema = z.array(
  z.object({
    text: z.string(),
    type: z.enum(['schedule', 'investigate', 'notify', 'expand', 'share']),
    prompt: z.string(),
  }),
);

export type ChatMessage = UIMessage<unknown, ChatDataParts>;
