import { tool } from 'ai';
import { z } from 'zod';
import type { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SlackInstallation } from './types';

async function resolveChannelId(slackClient: WebClient, channelName: string): Promise<string> {
  const result = await slackClient.conversations.list({
    types: 'public_channel,private_channel',
    limit: 200,
  });
  const channel = (result.channels || []).find((c) => c.name === channelName);
  if (!channel?.id) throw new Error(`Channel #${channelName} not found or bot not a member`);
  return channel.id;
}

async function resolveChannel(slackClient: WebClient, channel: string): Promise<string> {
  return channel.startsWith('#')
    ? resolveChannelId(slackClient, channel.slice(1))
    : channel;
}

export function createSlackTools(
  slackClient: WebClient,
  _installation: SlackInstallation,
  _supabase: SupabaseClient
): Record<string, any> {
  return {
    post_to_slack_channel: tool({
      description:
        'Post a message to a Slack channel proactively. Use when you need to send a notification, update, or alert to a specific channel without being asked there.',
      parameters: z.object({
        channel: z
          .string()
          .describe('Channel name starting with # (e.g. #general) or channel ID'),
        message: z.string().describe('The message to post. Use Slack mrkdwn formatting.'),
        thread_ts: z
          .string()
          .optional()
          .describe('If set, post as a reply inside this thread timestamp'),
      }),
      execute: async ({ channel, message, thread_ts }) => {
        const channelId = await resolveChannel(slackClient, channel);
        const result = await slackClient.chat.postMessage({
          channel: channelId,
          text: message,
          thread_ts,
          unfurl_links: false,
        });
        return { ok: true, ts: result.ts, channel: result.channel };
      },
    }),

    update_slack_message: tool({
      description: 'Update/edit a Slack message that was previously posted by the bot.',
      parameters: z.object({
        channel: z.string().describe('Channel ID or name starting with #'),
        message_ts: z.string().describe('Timestamp of the message to update'),
        new_text: z.string().describe('New message content (replaces the original)'),
      }),
      execute: async ({ channel, message_ts, new_text }) => {
        const channelId = await resolveChannel(slackClient, channel);
        await slackClient.chat.update({ channel: channelId, ts: message_ts, text: new_text });
        return { ok: true };
      },
    }),

    delete_slack_message: tool({
      description: 'Delete a Slack message that was previously posted by the bot.',
      parameters: z.object({
        channel: z.string().describe('Channel ID or name starting with #'),
        message_ts: z.string().describe('Timestamp of the message to delete'),
      }),
      execute: async ({ channel, message_ts }) => {
        const channelId = await resolveChannel(slackClient, channel);
        await slackClient.chat.delete({ channel: channelId, ts: message_ts });
        return { ok: true };
      },
    }),

    add_reaction: tool({
      description: 'Add an emoji reaction to a Slack message.',
      parameters: z.object({
        channel: z.string().describe('Channel ID or name starting with #'),
        message_ts: z.string().describe('Timestamp of the message to react to'),
        emoji: z
          .string()
          .describe('Emoji name without colons, e.g. "thumbsup", "white_check_mark"'),
      }),
      execute: async ({ channel, message_ts, emoji }) => {
        const channelId = await resolveChannel(slackClient, channel);
        await slackClient.reactions.add({ channel: channelId, timestamp: message_ts, name: emoji });
        return { ok: true };
      },
    }),

    list_slack_channels: tool({
      description: 'List Slack channels the bot is a member of.',
      parameters: z.object({}),
      execute: async () => {
        const result = await slackClient.conversations.list({
          types: 'public_channel,private_channel',
          limit: 200,
        });
        return (result.channels || [])
          .filter((c) => c.is_member)
          .map((c) => ({ id: c.id, name: c.name, topic: c.topic?.value || '' }));
      },
    }),

    get_slack_channel_history: tool({
      description: 'Get recent messages from a Slack channel.',
      parameters: z.object({
        channel: z.string().describe('Channel ID or name starting with #'),
        limit: z.number().optional().default(20).describe('Number of messages to fetch (max 100)'),
      }),
      execute: async ({ channel, limit }) => {
        const channelId = await resolveChannel(slackClient, channel);
        const result = await slackClient.conversations.history({ channel: channelId, limit });
        return (result.messages || []).map((m) => ({
          user: m.user,
          text: m.text,
          ts: m.ts,
          isBot: !!m.bot_id,
        }));
      },
    }),
  };
}
