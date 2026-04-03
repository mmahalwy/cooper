/**
 * POST /api/slack/interactions
 *
 * Handles Slack interactive component payloads (button clicks).
 * Slack sends a application/x-www-form-urlencoded body with a `payload` field
 * containing a JSON-encoded interaction payload.
 *
 * Supported action_ids:
 *   cooper_approve_{uuid}  — approve the pending action
 *   cooper_reject_{uuid}   — reject the pending action
 */

import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifySlackRequest } from '@/modules/slack/verify';
import { getInstallationByTeamId } from '@/modules/slack/installations';
import { getSlackClient } from '@/modules/slack/client';
import {
  resolvePendingAction,
  buildResolvedBlocks,
} from '@/modules/slack/interactive';

export const maxDuration = 30;

interface BlockActionsPayload {
  type: 'block_actions';
  team: { id: string; domain: string };
  user: { id: string; username: string; name: string };
  channel?: { id: string; name: string };
  message?: {
    ts: string;
    thread_ts?: string;
    channel?: string;
  };
  container?: {
    channel_id?: string;
    message_ts?: string;
    thread_ts?: string;
  };
  actions: Array<{
    action_id: string;
    value?: string;
  }>;
  response_url?: string;
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  // Verify Slack signature
  const signature = request.headers.get('x-slack-signature') || '';
  const timestamp = request.headers.get('x-slack-request-timestamp') || '';

  if (!verifySlackRequest(signature, timestamp, rawBody)) {
    console.warn('[slack:interactions] Invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // Parse application/x-www-form-urlencoded payload
  let interactionPayload: BlockActionsPayload;
  try {
    const params = new URLSearchParams(rawBody);
    const payloadJson = params.get('payload');
    if (!payloadJson) {
      return new Response('Missing payload', { status: 400 });
    }
    interactionPayload = JSON.parse(payloadJson);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  // We only handle block_actions
  if (interactionPayload.type !== 'block_actions') {
    return new Response('OK', { status: 200 });
  }

  // Ack immediately — Slack requires a response within 3 seconds
  after(async () => {
    try {
      await handleBlockActions(interactionPayload);
    } catch (err) {
      console.error('[slack:interactions] Handler error:', err);
    }
  });

  return new Response('', { status: 200 });
}

async function handleBlockActions(payload: BlockActionsPayload): Promise<void> {
  const teamId = payload.team?.id;
  if (!teamId) {
    console.error('[slack:interactions] Missing team ID');
    return;
  }

  const supabase = createServiceClient();
  const installation = await getInstallationByTeamId(supabase, teamId);
  if (!installation) {
    console.error('[slack:interactions] No installation for team:', teamId);
    return;
  }

  const slackClient = getSlackClient(installation.bot_token);

  for (const action of payload.actions) {
    const { action_id: actionId } = action;

    const isApprove = actionId.startsWith('cooper_approve_');
    const isReject = actionId.startsWith('cooper_reject_');

    if (!isApprove && !isReject) continue;

    const prefix = isApprove ? 'cooper_approve_' : 'cooper_reject_';
    const pendingActionId = actionId.slice(prefix.length);
    const approved = isApprove;
    const resolvedBy = payload.user?.id ?? 'unknown';

    // Resolve in DB
    const resolved = await resolvePendingAction(
      supabase,
      pendingActionId,
      approved,
      resolvedBy
    );

    if (!resolved) {
      // Already resolved or expired — update message to indicate that
      const channel =
        payload.channel?.id ?? payload.container?.channel_id ?? '';
      const messageTs =
        payload.message?.ts ?? payload.container?.message_ts ?? '';

      if (channel && messageTs) {
        await slackClient.chat.update({
          channel,
          ts: messageTs,
          text: 'This request has already been resolved or has expired.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '⚠️ This request has already been resolved or has expired.',
              },
            },
          ],
        });
      }
      return;
    }

    // Update the Slack message to show resolved state
    const channel =
      payload.channel?.id ?? payload.container?.channel_id ?? '';
    const messageTs =
      payload.message?.ts ?? payload.container?.message_ts ?? '';

    if (channel && messageTs) {
      const resolvedBlocks = buildResolvedBlocks(
        resolved.description,
        approved,
        resolvedBy
      );

      await slackClient.chat.update({
        channel,
        ts: messageTs,
        text: approved
          ? `✅ Approved by <@${resolvedBy}>: ${resolved.description}`
          : `❌ Rejected by <@${resolvedBy}>: ${resolved.description}`,
        blocks: resolvedBlocks,
      });
    }

    // Post a follow-up in the thread confirming the decision
    const threadTs =
      payload.message?.thread_ts ??
      payload.container?.thread_ts ??
      messageTs;

    if (channel && threadTs) {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: approved
          ? `✅ Got it — carrying out: _${resolved.description}_`
          : `❌ Cancelled: _${resolved.description}_`,
      });
    }
  }
}
