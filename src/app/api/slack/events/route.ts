import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifySlackRequest } from '@/modules/slack/verify';
import { getInstallationByTeamId } from '@/modules/slack/installations';
import { getSlackClient } from '@/modules/slack/client';
import { handleAppMention, handleDirectMessage, handleReactionAdded, handleMessageChanged, handleChannelMessage } from '@/modules/slack/handlers';
import { checkRateLimit } from '@/modules/agent/rate-limiter';
import type {
  SlackEventEnvelope,
  AppMentionEvent,
  MessageImEvent,
  ReactionAddedEvent,
  MessageChangedEvent,
  MessageChannelEvent,
} from '@/modules/slack/types';

export const maxDuration = 300;

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Parse payload first — url_verification doesn't need signature check
  let payload: SlackEventEnvelope;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Slack URL verification challenge (sent during app setup)
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Verify request signature
  const signature = request.headers.get('x-slack-signature') || '';
  const timestamp = request.headers.get('x-slack-request-timestamp') || '';

  if (!verifySlackRequest(signature, timestamp, rawBody)) {
    console.warn('[slack] Invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // Return 200 immediately — Slack requires ack within 3 seconds.
  // All processing happens in after().
  after(async () => {
    try {
      const supabase = createServiceClient();

      // Deduplicate events — Slack retries delivery if it doesn't get a 200
      // within 3 seconds, which causes duplicate responses since AI processing
      // always takes longer than 3s.
      const eventId = payload.event_id;
      if (eventId) {
        const { data: existing } = await supabase
          .from('slack_processed_events')
          .select('event_id')
          .eq('event_id', eventId)
          .single();

        if (existing) {
          console.log('[slack] Duplicate event, skipping:', eventId);
          return;
        }

        const { error: insertError } = await supabase
          .from('slack_processed_events')
          .insert({ event_id: eventId, processed_at: new Date().toISOString() });

        if (insertError) {
          // Another instance beat us to it (unique constraint violation) — skip
          console.log('[slack] Event already claimed by another instance, skipping:', eventId);
          return;
        }
      }

      const teamId = payload.team_id;

      const installation = await getInstallationByTeamId(supabase, teamId);
      if (!installation) {
        console.error('[slack] No installation found for team:', teamId);
        return;
      }

      // Rate limit check — sliding window per org. Slack always needs a 200
      // (already sent above), so we post an ephemeral message and bail out.
      const rateLimitResult = await checkRateLimit(supabase, installation.org_id);
      if (!rateLimitResult.allowed) {
        console.warn('[slack] Rate limit exceeded for org:', installation.org_id);
        const slackClientForLimit = getSlackClient(installation.bot_token);
        const event = payload.event;
        // Determine channel + user from the triggering event so we can send
        // an ephemeral message back to the right person.
        const channel = (event as { channel?: string }).channel;
        const userId = (event as { user?: string }).user;
        if (channel && userId) {
          await slackClientForLimit.chat.postEphemeral({
            channel,
            user: userId,
            text: '⚡ Cooper is getting a lot of requests right now — try again in a moment.',
          }).catch((err) => console.error('[slack] Failed to post rate-limit ephemeral:', err));
        }
        return;
      }

      const slackClient = getSlackClient(installation.bot_token);
      const ctx = { supabase, slackClient, installation };
      const event = payload.event;

      if (event.type === 'app_mention') {
        await handleAppMention(ctx, event as AppMentionEvent);
      }

      if (
        event.type === 'message' &&
        (event as MessageImEvent).channel_type === 'im' &&
        !(event as MessageImEvent).subtype &&
        !(event as MessageImEvent).bot_id
      ) {
        await handleDirectMessage(ctx, event as MessageImEvent);
      }

      if (event.type === 'reaction_added') {
        await handleReactionAdded(ctx, event as ReactionAddedEvent);
      }

      // Handle message edits
      if (event.type === 'message' && (event as MessageChangedEvent).subtype === 'message_changed') {
        const changedEvent = event as MessageChangedEvent;
        // Only handle if it's a user message (not bot message edits)
        if (changedEvent.message?.user && !changedEvent.message?.bot_id) {
          await handleMessageChanged(ctx, changedEvent);
        }
      }
    } catch (err) {
      console.error('[slack] Event processing error:', err);
    }
  });

  return new Response('OK', { status: 200 });
}
