/**
 * Generate smart thread titles using LLM.
 * Runs in background after the first exchange.
 */

import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generate a concise, descriptive title for a thread.
 * Only runs once — skips if thread already has a good title.
 */
export async function generateThreadTitle(
  supabase: SupabaseClient,
  threadId: string,
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  try {
    // Check if this is a fresh thread (title matches first message)
    const { data: thread } = await supabase
      .from('threads')
      .select('title')
      .eq('id', threadId)
      .single();

    if (!thread) return;

    // Skip if title was manually set or already generated (doesn't start like the message)
    const currentTitle = thread.title || '';
    const msgPrefix = userMessage.slice(0, 50);
    if (currentTitle && !userMessage.startsWith(currentTitle.slice(0, 30))) return;

    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: `Generate a short, descriptive title (3-7 words) for a conversation. The title should capture the main topic or action. No quotes, no periods, no emojis. Examples:
- "Weekly metrics comparison"
- "Debug login flow issue"
- "Set up daily standup report"
- "Q1 revenue analysis"`,
      prompt: `User: ${userMessage.slice(0, 500)}\nAssistant: ${assistantResponse.slice(0, 500)}`,
    });

    const title = result.text.trim().replace(/^["']|["']$/g, '').slice(0, 100);
    if (title) {
      await supabase
        .from('threads')
        .update({ title })
        .eq('id', threadId);

      console.log(`[title] Generated: "${title}" for thread ${threadId}`);
    }
  } catch (error) {
    console.error('[title] Generation failed:', error);
  }
}
