import { after } from 'next/server';
import { verifySlackRequest } from '@/modules/slack/verify';
import { getInstallationByTeamId } from '@/modules/slack/installations';
import { getSlackClient } from '@/modules/slack/client';
import { processSlashCommand } from '@/modules/slack/handlers';
import { createServiceClient } from '@/lib/supabase/service';

export const maxDuration = 300;

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify Slack request signature
  const signature = request.headers.get('x-slack-signature') || '';
  const timestamp = request.headers.get('x-slack-request-timestamp') || '';
  if (!verifySlackRequest(signature, timestamp, rawBody)) {
    console.warn('[slack/commands] Invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // Parse form-encoded body from Slack
  const params = new URLSearchParams(rawBody);
  const text = params.get('text') || '';
  const userId = params.get('user_id') || '';
  const channelId = params.get('channel_id') || '';
  const teamId = params.get('team_id') || '';
  const responseUrl = params.get('response_url') || '';

  // Ack immediately — Slack requires a response within 3 seconds
  after(async () => {
    try {
      const supabase = createServiceClient();
      const installation = await getInstallationByTeamId(supabase, teamId);
      if (!installation) {
        console.error('[slack/commands] No installation found for team:', teamId);
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text: '⚠️ Cooper is not installed for this workspace. Visit your settings to reconnect.',
          }),
        });
        return;
      }

      const slackClient = getSlackClient(installation.bot_token);
      const ctx = { supabase, slackClient, installation };

      // Handle built-in sub-commands
      const trimmedText = text.trim();

      if (!trimmedText || trimmedText === 'help') {
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text: '*Cooper commands:*\n• `/cooper <question>` — Ask Cooper anything\n• `/cooper status` — Check Cooper\'s status\n• `/cooper skills` — List available skills\n• `/cooper forget` — Clear context for this channel',
          }),
        });
        return;
      }

      if (trimmedText === 'status') {
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text: '✅ Cooper is online and ready.',
          }),
        });
        return;
      }

      if (trimmedText === 'skills') {
        await processSlashCommand(ctx, {
          userId,
          teamId,
          channelId,
          text: 'List all available skills you have',
          responseUrl,
        });
        return;
      }

      if (trimmedText === 'forget') {
        // Clear thread mapping for this channel so a fresh context starts next time
        await supabase
          .from('slack_thread_mappings')
          .delete()
          .eq('slack_channel_id', channelId)
          .eq('org_id', installation.org_id);

        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_type: 'ephemeral',
            text: '🧹 Context cleared for this channel. Starting fresh!',
          }),
        });
        return;
      }

      // Default: treat text as a message to process
      await processSlashCommand(ctx, {
        userId,
        teamId,
        channelId,
        text: trimmedText,
        responseUrl,
      });
    } catch (err) {
      console.error('[slack/commands] Error processing command:', err);
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: '❌ Something went wrong. Please try again.',
        }),
      }).catch(() => {});
    }
  });

  // Immediate ephemeral ack to Slack
  return new Response(
    JSON.stringify({ response_type: 'ephemeral', text: '🤔 Thinking...' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
