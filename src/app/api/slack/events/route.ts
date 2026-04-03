import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifySlackRequest } from '@/modules/slack/verify';
import { getInstallationByTeamId } from '@/modules/slack/installations';
import { getSlackClient } from '@/modules/slack/client';
import { handleAppMention, handleDirectMessage } from '@/modules/slack/handlers';
import type {
  SlackEventEnvelope,
  AppMentionEvent,
  MessageImEvent,
} from '@/modules/slack/types';

export const maxDuration = 60;

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
    } catch (err) {
      console.error('[slack] Event processing error:', err);
    }
  });

  return new Response('OK', { status: 200 });
}
