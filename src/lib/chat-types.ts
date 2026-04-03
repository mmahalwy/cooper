import { z } from 'zod';
import type { UIMessage } from 'ai';

/**
 * Custom data part types sent through the AI SDK stream.
 * These appear as `data-suggestions` parts on UIMessage.
 */
export type ChatDataParts = {
  suggestions: SuggestionData[];
  status: StatusData;
};

export type SuggestionData = {
  text: string;
  type: 'schedule' | 'investigate' | 'notify' | 'expand' | 'share';
  prompt: string;
};

export type StatusData = {
  message: string;
  source: 'agent' | 'integration';
  step?: number;
  toolName?: string;
};

export const suggestionsPartSchema = z.array(
  z.object({
    text: z.string(),
    type: z.enum(['schedule', 'investigate', 'notify', 'expand', 'share']),
    prompt: z.string(),
  }),
);

export const statusPartSchema = z.object({
  message: z.string(),
  source: z.enum(['agent', 'integration']),
  step: z.number().int().positive().optional(),
  toolName: z.string().optional(),
});

export type ChatMessage = UIMessage<unknown, ChatDataParts>;
