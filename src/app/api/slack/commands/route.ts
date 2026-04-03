import { type NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getInstallationByTeamId } from '@/modules/slack/installations';
import { verifySlackRequest } from '@/modules/slack/verify';

export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  // Verify Slack signature
  const signature = req.headers.get('x-slack-signature') || '';
  const timestamp = req.headers.get('x-slack-request-timestamp') || '';

  if (!verifySlackRequest(signature, timestamp, rawBody)) {
    console.warn('[slack/commands] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const text = (params.get('text') || '').trim();
  const teamId = params.get('team_id') || '';
  const userId = params.get('user_id') || '';

  const supabase = createServiceClient();

  const installation = await getInstallationByTeamId(supabase, teamId);
  if (!installation) {
    return NextResponse.json({
      text: '❌ Cooper is not installed for this workspace.',
      response_type: 'ephemeral',
    });
  }

  // Parse subcommand and remaining args
  const parts = text.split(/\s+/);
  const subCommand = (parts[0] || '').toLowerCase();
  const args = parts.slice(1).join(' ').trim();

  switch (subCommand) {
    case 'status': {
      const { data: userMapping } = await supabase
        .from('slack_user_mappings')
        .select('org_id')
        .eq('slack_user_id', userId)
        .eq('slack_team_id', teamId)
        .single();

      if (!userMapping) {
        return NextResponse.json({
          text: "_You haven't chatted with Cooper yet. DM me to get started!_",
          response_type: 'ephemeral',
        });
      }

      const [{ data: connections }, { data: schedules }] = await Promise.all([
        supabase.from('connections').select('service').eq('org_id', userMapping.org_id),
        supabase
          .from('scheduled_tasks')
          .select('name, cron, status')
          .eq('org_id', userMapping.org_id)
          .eq('status', 'active'),
      ]);

      const connectionList =
        connections?.map((c) => `• ${c.service}`).join('\n') || '_None yet_';
      const scheduleList =
        schedules?.map((s) => `• ${s.name} \`${s.cron}\``).join('\n') || '_None yet_';

      return NextResponse.json({
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '⚡ Cooper Status' } },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Connected tools* (${connections?.length || 0})\n${connectionList}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Active schedules* (${schedules?.length || 0})\n${scheduleList}`,
            },
          },
        ],
        response_type: 'ephemeral',
      });
    }

    case 'memory': {
      const { data: userMapping } = await supabase
        .from('slack_user_mappings')
        .select('org_id')
        .eq('slack_user_id', userId)
        .eq('slack_team_id', teamId)
        .single();

      if (!userMapping) {
        return NextResponse.json({
          text: '_No memory yet._',
          response_type: 'ephemeral',
        });
      }

      const { data: knowledge } = await supabase
        .from('knowledge')
        .select('content, source, created_at')
        .eq('org_id', userMapping.org_id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!knowledge?.length) {
        return NextResponse.json({
          text: "_I haven't learned anything about your org yet. Chat with me and I'll start picking things up._",
          response_type: 'ephemeral',
        });
      }

      return NextResponse.json({
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '🧠 What I know about your org' } },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: knowledge.map((k) => `• ${k.content}`).join('\n'),
            },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: 'Use `/cooper forget [query]` to remove something' },
            ],
          },
        ],
        response_type: 'ephemeral',
      });
    }

    case 'skills': {
      const { data: userMapping } = await supabase
        .from('slack_user_mappings')
        .select('org_id')
        .eq('slack_user_id', userId)
        .eq('slack_team_id', teamId)
        .single();

      if (!userMapping) {
        return NextResponse.json({
          text: '_No skills yet._',
          response_type: 'ephemeral',
        });
      }

      const { data: skills } = await supabase
        .from('skills')
        .select('name, description, usage_count')
        .eq('org_id', userMapping.org_id)
        .order('usage_count', { ascending: false });

      if (!skills?.length) {
        return NextResponse.json({
          text: "_No saved skills yet. When I complete a multi-step workflow, I'll save it as a skill._",
          response_type: 'ephemeral',
        });
      }

      const skillList = skills
        .map((s) => `• *${s.name}* — ${s.description} _(used ${s.usage_count}x)_`)
        .join('\n');

      return NextResponse.json({
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '🎯 Saved Skills' } },
          { type: 'section', text: { type: 'mrkdwn', text: skillList } },
        ],
        response_type: 'ephemeral',
      });
    }

    case 'forget': {
      if (!args) {
        return NextResponse.json({
          text: '_Please provide a search query. Example: `/cooper forget standup schedule`_',
          response_type: 'ephemeral',
        });
      }

      const { data: userMapping } = await supabase
        .from('slack_user_mappings')
        .select('org_id')
        .eq('slack_user_id', userId)
        .eq('slack_team_id', teamId)
        .single();

      if (!userMapping) {
        return NextResponse.json({
          text: '_No memory found._',
          response_type: 'ephemeral',
        });
      }

      // Find matching knowledge entries using text search
      const { data: matches } = await supabase
        .from('knowledge')
        .select('id, content')
        .eq('org_id', userMapping.org_id)
        .ilike('content', `%${args}%`);

      if (!matches?.length) {
        return NextResponse.json({
          text: `_No memory entries matched "${args}"._`,
          response_type: 'ephemeral',
        });
      }

      const ids = matches.map((m) => m.id);
      await supabase.from('knowledge').delete().in('id', ids);

      return NextResponse.json({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ Forgot ${matches.length} item${matches.length === 1 ? '' : 's'} matching *"${args}"*:\n${matches.map((m) => `• ${m.content}`).join('\n')}`,
            },
          },
        ],
        response_type: 'ephemeral',
      });
    }

    case 'help':
    default: {
      return NextResponse.json({
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '🤖 Cooper Commands' } },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                '• `/cooper status` — connected tools and active schedules',
                '• `/cooper memory` — what I\'ve learned about your org',
                '• `/cooper skills` — saved workflows',
                '• `/cooper forget [query]` — delete memory matching a search query',
                '• `/cooper help` — this message',
                '',
                'Or just DM me — I\'m better in conversation.',
              ].join('\n'),
            },
          },
        ],
        response_type: 'ephemeral',
      });
    }
  }
}
