import { WebClient } from '@slack/web-api';
import { SupabaseClient } from '@supabase/supabase-js';

export async function handleAppHomeOpened(
  ctx: { slackClient: WebClient; supabase: SupabaseClient; installation: any },
  event: { user: string; tab: string; view?: { id: string } }
): Promise<void> {
  if (event.tab !== 'home') return;

  const { slackClient, supabase, installation } = ctx;
  const slackUserId = event.user;

  // Resolve user to org
  const { data: userMapping } = await supabase
    .from('slack_user_mappings')
    .select('org_id, user_id')
    .eq('slack_user_id', slackUserId)
    .eq('slack_team_id', installation.team_id)
    .single();

  // Get recent thread activity (last 5 threads)
  let recentThreads: Array<{ title: string; updated_at: string }> = [];
  if (userMapping) {
    const { data: threads } = await supabase
      .from('threads')
      .select('title, updated_at')
      .eq('org_id', userMapping.org_id)
      .order('updated_at', { ascending: false })
      .limit(5);
    recentThreads = threads || [];
  }

  // Get connected services
  let connectedServices: string[] = [];
  if (userMapping) {
    const { data: connections } = await supabase
      .from('connections')
      .select('service')
      .eq('org_id', userMapping.org_id);
    connectedServices = connections?.map((c) => c.service) || [];
  }

  // Build Block Kit Home view
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: "👋 Hey! I'm Cooper, your AI teammate." },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Just DM me or @mention me in any channel to get started. Here\'s what I can do:',
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔧 What I can do*\n• Answer questions and do research\n• Execute tasks across your connected tools\n• Schedule recurring reports and briefings\n• Remember things about your team and processes\n• Draft documents, emails, and summaries',
      },
    },
  ];

  // Connected services section
  if (connectedServices.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔌 Connected tools*\n${connectedServices.map((s) => `• ${s}`).join('\n')}`,
      },
    });
  }

  // Recent activity
  if (recentThreads.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🕐 Recent conversations*\n${recentThreads
          .map((t) => {
            const time = new Date(t.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            return `• ${t.title || 'Untitled'} _${time}_`;
          })
          .join('\n')}`,
      },
    });
  }

  // Quick start section
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*⚡ Try asking me:*\n• _"Summarize what happened in #engineering this week"_\n• _"Schedule a daily standup summary every Monday at 9am"_\n• _"What do you know about our codebase?"_\n• _"Help me draft a status update for the team"_',
    },
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Cooper • ${new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}`,
      },
    ],
  });

  // Publish the home view
  await slackClient.views.publish({
    user_id: slackUserId,
    view: {
      type: 'home',
      blocks,
    },
  });
}
