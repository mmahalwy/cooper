/**
 * Slack-specific tools that are only available during a Slack interaction.
 *
 * Currently exposes:
 *   - request_approval: Post an approval request message with Approve/Reject buttons.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import { postApprovalRequest } from './interactive';

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
          .record(z.unknown())
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
  };
}
