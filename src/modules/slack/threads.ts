import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebClient } from '@slack/web-api';

export interface SlackMessage {
  user: string;
  text: string;
  ts: string;
  bot_id?: string;
}

export function convertSlackHistoryToMessages(
  messages: SlackMessage[],
  botUserId: string
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    const isBot = msg.bot_id || msg.user === botUserId;
    const cleanText = msg.text.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim();
    if (!cleanText) continue;

    result.push({
      role: isBot ? 'assistant' : 'user',
      content: cleanText,
    });
  }

  return result;
}

export async function getSlackThreadHistory(
  slackClient: WebClient,
  channel: string,
  threadTs: string,
  botUserId: string
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const response = await slackClient.conversations.replies({
    channel,
    ts: threadTs,
    limit: 50,
  });

  const messages = (response.messages || []).map((m) => ({
    user: m.user || '',
    text: m.text || '',
    ts: m.ts || '',
    bot_id: m.bot_id,
  }));

  return convertSlackHistoryToMessages(messages, botUserId);
}

export async function findOrCreateThreadMapping(
  supabase: SupabaseClient,
  slackChannelId: string,
  slackThreadTs: string,
  orgId: string,
  userId: string
): Promise<{ threadId: string; isNew: boolean }> {
  const { data: existing } = await supabase
    .from('slack_thread_mappings')
    .select('thread_id')
    .eq('slack_channel_id', slackChannelId)
    .eq('slack_thread_ts', slackThreadTs)
    .single();

  if (existing) {
    return { threadId: existing.thread_id, isNew: false };
  }

  const { data: thread, error } = await supabase
    .from('threads')
    .insert({
      org_id: orgId,
      user_id: userId,
      title: 'Slack conversation',
      source: 'slack',
    })
    .select('id')
    .single();

  if (error || !thread) {
    throw new Error(`Failed to create thread: ${error?.message}`);
  }

  await supabase.from('slack_thread_mappings').insert({
    slack_channel_id: slackChannelId,
    slack_thread_ts: slackThreadTs,
    thread_id: thread.id,
    org_id: orgId,
  });

  return { threadId: thread.id, isNew: true };
}

