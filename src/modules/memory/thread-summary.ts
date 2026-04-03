import { SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { embeddingProvider } from './embeddings';

/**
 * Generate a concise summary of a conversation thread and store it
 * for cross-thread recall. Called after a conversation reaches a natural
 * stopping point (e.g., 5+ messages exchanged).
 */
export async function summarizeAndStoreThread(
  supabase: SupabaseClient,
  threadId: string,
  orgId: string,
  userId?: string,
): Promise<void> {
  try {
    // Fetch all messages in the thread
    const { data: messages, error } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error || !messages || messages.length < 4) {
      // Don't summarize very short conversations
      return;
    }

    // Check if we already have a summary for this thread
    const { data: existing } = await supabase
      .from('thread_summaries')
      .select('id, message_count')
      .eq('thread_id', threadId)
      .single();

    // Skip if summary is already up to date
    if (existing && existing.message_count >= messages.length) {
      return;
    }

    // Build conversation text for summarization
    const conversationText = messages
      .map((m: any) => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 8000); // Cap to avoid token limits

    // Generate summary using a fast model
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system:
        'You are a conversation summarizer. Create a concise 2-4 sentence summary of the following conversation. Focus on: what was discussed, what was decided, what actions were taken, and any key information shared. Be factual and specific.',
      prompt: conversationText,
    });

    const summary = result.text;
    if (!summary) return;

    // Embed the summary
    const embedding = await embeddingProvider.embed(summary);

    if (existing) {
      // Update existing summary
      await supabase
        .from('thread_summaries')
        .update({
          summary,
          user_id: userId || null,
          message_count: messages.length,
          embedding,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      // Insert new summary
      await supabase
        .from('thread_summaries')
        .insert({
          thread_id: threadId,
          org_id: orgId,
          user_id: userId || null,
          summary,
          message_count: messages.length,
          embedding,
        });
    }

    console.log(
      `[memory] Stored thread summary for ${threadId} (${messages.length} messages)`
    );
  } catch (error) {
    console.error('[memory] Failed to summarize thread:', error);
  }
}
