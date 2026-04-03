/**
 * Slack-specific tools that are only available during a Slack interaction.
 *
 * Currently exposes:
 *   - request_approval: Post an approval request message with Approve/Reject buttons.
 *   - monitor_slack_channel: Add/remove channels from Cooper's opt-in monitoring list.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import { postApprovalRequest } from './interactive';
import { upsertMonitoredChannel, removeMonitoredChannel, listMonitoredChannels } from './monitored-channels';

export function createSlackInteractiveTools(
  slackClient: WebClient,
  supabase: SupabaseClient,
  channel: string,
  threadTs: string,
  orgId: string,
  threadId: string
) {
  return {
    request_approval: tool({
      description: `Ask the user to approve or reject an action before you carry it out.

Use this whenever you are about to perform a potentially irreversible or impactful action, such as:
- Sending an email or Slack message on the user's behalf
- Deleting or modifying records
- Making purchases or API calls with side effects
- Posting content to external systems

The user will see an interactive Slack message with Approve and Reject buttons.
You will NOT automatically receive the result — after calling this tool, stop and wait.
When the user approves or rejects, they will see a confirmation in the thread and can follow up with you.

Return a brief summary of what you are waiting for.`,
      inputSchema: z.object({
        description: z
          .string()
          .describe(
            'A clear, concise description of what action requires approval. ' +
              'E.g. "Send a follow-up email to john@example.com about the Q2 report"'
          ),
        action_type: z
          .string()
          .optional()
          .describe(
            'Short category of the action, e.g. "send_email", "delete_record", "post_message"'
          ),
        context: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Additional structured context to store with the pending action (e.g. email body, record ID)'),
      }),
      execute: async ({ description, action_type, context }) => {
        try {
          const actionPayload: Record<string, unknown> = {
            ...(action_type ? { action_type } : {}),
            ...(context ?? {}),
          };

          const actionId = await postApprovalRequest(
            slackClient,
            supabase,
            channel,
            threadTs,
            orgId,
            threadId,
            description,
            actionPayload
          );

          return {
            success: true,
            actionId,
            message: `Approval request sent. Waiting for user to approve or reject: "${description}"`,
          };
        } catch (err) {
          console.error('[slack:tools] request_approval failed:', err);
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      },
    }),

    // -------------------------------------------------------------------------
    // monitor_slack_channel
    // -------------------------------------------------------------------------
    monitor_slack_channel: tool({
      description: `Add, update, or remove a Slack channel from Cooper's opt-in monitoring list, or list all monitored channels.

When monitoring is active, Cooper silently watches the channel and proactively replies
when it detects something relevant — based on keywords, patterns (like "error", "help",
question marks), or @mentions.

Use this when a user says something like:
- "watch #engineering for errors"
- "monitor #support and reply to questions"
- "stop monitoring #general"
- "list which channels you're watching"

Actions:
- "add" / "update": Register the channel (creates or replaces the row)
- "remove": Stop monitoring the channel
- "list": Show all currently monitored channels for this org`,
      inputSchema: z.object({
        action: z
          .enum(['add', 'update', 'remove', 'list'])
          .describe('"add" or "update" to enable monitoring, "remove" to stop, "list" to show all'),
        channel_id: z
          .string()
          .optional()
          .describe('Slack channel ID (e.g. C012AB3CD). Required for add/update/remove.'),
        channel_name: z
          .string()
          .optional()
          .describe('Human-readable channel name without #, e.g. "engineering". Used for display.'),
        keywords: z
          .array(z.string())
          .optional()
          .describe('Extra keywords that trigger Cooper (e.g. ["deploy", "outage", "pagerduty"])'),
        patterns: z
          .array(z.string())
          .optional()
          .describe(
            'Pattern strings to match (case-insensitive substrings). ' +
              'Defaults: ["error", "help", "?"]. Provide to override completely.'
          ),
        mentions: z
          .boolean()
          .optional()
          .describe('If true (default), trigger on any @mention of a user in the channel'),
      }),
      execute: async ({ action, channel_id, channel_name, keywords, patterns, mentions }) => {
        try {
          if (action === 'list') {
            const channels = await listMonitoredChannels(supabase, orgId);
            if (channels.length === 0) {
              return { success: true, message: 'No channels are currently being monitored.' };
            }
            const summary = channels
              .map((c) => {
                const name = c.channel_name ? `#${c.channel_name}` : c.channel_id;
                const pats = `patterns: ${c.triggers.patterns.join(', ')}`;
                const kws =
                  c.triggers.keywords.length > 0
                    ? `, keywords: ${c.triggers.keywords.join(', ')}`
                    : '';
                return `• ${name} — ${pats}${kws}`;
              })
              .join('\n');
            return { success: true, message: `Monitored channels:\n${summary}` };
          }

          if (!channel_id) {
            return { success: false, error: 'channel_id is required for add/update/remove' };
          }

          if (action === 'remove') {
            await removeMonitoredChannel(supabase, orgId, channel_id);
            const name = channel_name ? `#${channel_name}` : channel_id;
            return { success: true, message: `Stopped monitoring ${name}.` };
          }

          // add / update
          const triggerOverrides: Record<string, unknown> = {};
          if (keywords !== undefined) triggerOverrides.keywords = keywords;
          if (patterns !== undefined) triggerOverrides.patterns = patterns;
          if (mentions !== undefined) triggerOverrides.mentions = mentions;

          const row = await upsertMonitoredChannel(
            supabase,
            orgId,
            channel_id,
            channel_name,
            triggerOverrides as any
          );

          const name = row.channel_name ? `#${row.channel_name}` : row.channel_id;
          const pats = row.triggers.patterns.join(', ');
          const kws =
            row.triggers.keywords.length > 0
              ? ` + keywords: ${row.triggers.keywords.join(', ')}`
              : '';

          return {
            success: true,
            message: `Now monitoring ${name}. I'll respond when I detect: ${pats}${kws}.`,
          };
        } catch (err) {
          console.error('[slack:tools] monitor_slack_channel failed:', err);
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      },
    }),
  };
}
