/**
 * Smart context window management.
 * 
 * Instead of passing all messages to the model, keeps recent messages
 * and summarizes older ones into a compact context block.
 */

import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import type { UIMessage } from 'ai';

const RECENT_MESSAGE_COUNT = 10; // Keep last 10 messages in full
const SUMMARY_THRESHOLD = 15;    // Only summarize if total > 15 messages

interface ManagedContext {
  /** Summary of older messages (injected into system prompt) */
  conversationSummary: string | null;
  /** Recent messages to pass to the model */
  recentMessages: UIMessage[];
  /** Whether summarization was applied */
  wasSummarized: boolean;
  /** Original message count */
  originalCount: number;
}

/**
 * Manage the context window by summarizing old messages
 * and keeping recent ones in full.
 */
export async function manageContextWindow(
  messages: UIMessage[],
): Promise<ManagedContext> {
  // Short conversations don't need management
  if (messages.length <= SUMMARY_THRESHOLD) {
    return {
      conversationSummary: null,
      recentMessages: messages,
      wasSummarized: false,
      originalCount: messages.length,
    };
  }

  // Split into old (to summarize) and recent (to keep)
  const splitPoint = messages.length - RECENT_MESSAGE_COUNT;
  const oldMessages = messages.slice(0, splitPoint);
  const recentMessages = messages.slice(splitPoint);

  // Build conversation text from old messages
  const conversationText = oldMessages
    .map(msg => {
      const text = msg.parts
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map(p => p.text)
        .join('') || '';
      return `${msg.role}: ${text}`;
    })
    .join('\n')
    .slice(0, 6000); // Cap input to avoid recursive token bloat

  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: 'Summarize this conversation history concisely. Focus on: key topics discussed, decisions made, important context, and any ongoing tasks. Keep it under 500 words.',
      prompt: conversationText,
    });

    console.log(`[context] Summarized ${oldMessages.length} old messages into ${result.text.length} chars, keeping ${recentMessages.length} recent`);

    return {
      conversationSummary: result.text,
      recentMessages,
      wasSummarized: true,
      originalCount: messages.length,
    };
  } catch (error) {
    console.error('[context] Summarization failed, using full messages:', error);
    return {
      conversationSummary: null,
      recentMessages: messages,
      wasSummarized: false,
      originalCount: messages.length,
    };
  }
}
