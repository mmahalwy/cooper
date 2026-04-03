/**
 * Slack interactive messages — approval/rejection flows.
 *
 * The flow:
 *   1. Agent calls `request_approval` tool
 *   2. `postApprovalRequest` creates a DB record and posts a Slack message
 *      with Approve / Reject buttons whose action_ids embed the record UUID.
 *   3. User clicks a button → POST /api/slack/interactions
 *   4. Interaction handler calls `resolvePendingAction`, updates original message.
 */

import type { WebClient } from '@slack/web-api';
import type { Block, KnownBlock } from '@slack/types';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function createPendingAction(
  supabase: SupabaseClient,
  orgId: string,
  threadId: string,
  slackChannelId: string,
  slackThreadTs: string,
  description: string,
  actionPayload: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await supabase
    .from('slack_pending_actions')
    .insert({
      org_id: orgId,
      thread_id: threadId,
      slack_channel_id: slackChannelId,
      slack_thread_ts: slackThreadTs,
      description,
      action_payload: actionPayload,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create pending action: ${error?.message}`);
  }

  return data.id as string;
}

export async function resolvePendingAction(
  supabase: SupabaseClient,
  actionId: string,
  approved: boolean,
  resolvedBy: string
): Promise<{ description: string; actionPayload: Record<string, unknown> } | null> {
  const { data, error } = await supabase
    .from('slack_pending_actions')
    .update({
      status: approved ? 'approved' : 'rejected',
      resolved_by: resolvedBy,
    })
    .eq('id', actionId)
    .eq('status', 'pending') // only resolve if still pending
    .select('description, action_payload')
    .single();

  if (error || !data) {
    console.error('[slack:interactive] Failed to resolve pending action:', error);
    return null;
  }

  return {
    description: data.description as string,
    actionPayload: (data.action_payload ?? {}) as Record<string, unknown>,
  };
}

export async function updatePendingActionMessageTs(
  supabase: SupabaseClient,
  actionId: string,
  messageTs: string
): Promise<void> {
  await supabase
    .from('slack_pending_actions')
    .update({ slack_message_ts: messageTs })
    .eq('id', actionId);
}

// ─── Block builders ───────────────────────────────────────────────────────────

export function buildApprovalBlocks(description: string, actionId: string): (Block | KnownBlock)[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Action requires your approval:*\n${description}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Approve', emoji: true },
          style: 'primary',
          action_id: `cooper_approve_${actionId}`,
          value: actionId,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Reject', emoji: true },
          style: 'danger',
          action_id: `cooper_reject_${actionId}`,
          value: actionId,
        },
      ],
    },
  ];
}

export function buildResolvedBlocks(
  description: string,
  approved: boolean,
  resolvedBy: string
): (Block | KnownBlock)[] {
  const icon = approved ? '✅' : '❌';
  const label = approved ? 'Approved' : 'Rejected';
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${icon} *${label}* by <@${resolvedBy}>\n_${description}_`,
      },
    },
  ];
}

// ─── High-level helper ────────────────────────────────────────────────────────

/**
 * Create a pending-action record and post the approval-request message to Slack.
 * Returns the actionId so the agent can reference it later.
 */
export async function postApprovalRequest(
  slackClient: WebClient,
  supabase: SupabaseClient,
  channel: string,
  threadTs: string,
  orgId: string,
  threadId: string,
  description: string,
  actionPayload: Record<string, unknown> = {}
): Promise<string> {
  // 1. Create the DB record (without message_ts for now)
  const actionId = await createPendingAction(
    supabase,
    orgId,
    threadId,
    channel,
    threadTs,
    description,
    actionPayload
  );

  // 2. Post to Slack
  const blocks = buildApprovalBlocks(description, actionId);
  const result = await slackClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `Action requires your approval: ${description}`, // fallback text
    blocks,
  });

  // 3. Persist the message_ts so the interaction handler can update it
  if (result.ts) {
    await updatePendingActionMessageTs(supabase, actionId, result.ts as string);
  }

  return actionId;
}
