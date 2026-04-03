import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifySlackRequest } from '@/modules/slack/verify';
import { getInstallationByTeamId } from '@/modules/slack/installations';
import { getSlackClient } from '@/modules/slack/client';
import { handleAppMention, handleDirectMessage, handleReactionAdded } from '@/modules/slack/handlers';
import type {
  SlackEventEnvelope,
  AppMentionEvent,
  MessageImEvent,
  ReactionAddedEvent,
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
    } catch (err) {
      console.error('[slack] Event processing error:', err);
    }
  });

  return new Response('OK', { status: 200 });
}
