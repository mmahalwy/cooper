/**
 * Helpers for the opt-in channel monitoring feature.
 *
 * `slack_monitored_channels` rows configure which channels Cooper watches and
 * what triggers a proactive response (keywords, patterns, question marks, …).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelTriggers {
  /** Plain-text keywords (case-insensitive). */
  keywords: string[];
  /**
   * Simple pattern strings. Built-ins: "error", "help", "?".
   * Any string here will be matched case-insensitively inside the message text.
   */
  patterns: string[];
  /** If true, any message that @mentions a real user is treated as a trigger. */
  mentions: boolean;
}

export interface MonitoredChannel {
  id: string;
  org_id: string;
  channel_id: string;
  channel_name: string | null;
  triggers: ChannelTriggers;
  created_at: string;
}

const DEFAULT_TRIGGERS: ChannelTriggers = {
  keywords: [],
  patterns: ['error', 'help', '?'],
  mentions: true,
};

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Look up a monitored-channel row for a given org + Slack channel.
 * Returns `null` when the channel is not being monitored.
 */
export async function getMonitoredChannel(
  supabase: SupabaseClient,
  orgId: string,
  channelId: string
): Promise<MonitoredChannel | null> {
  const { data, error } = await supabase
    .from('slack_monitored_channels')
    .select('*')
    .eq('org_id', orgId)
    .eq('channel_id', channelId)
    .single();

  if (error || !data) return null;

  return {
    ...data,
    triggers: { ...DEFAULT_TRIGGERS, ...(data.triggers ?? {}) },
  } as MonitoredChannel;
}

/**
 * Upsert a monitored-channel record.
 * Used by the `monitor_slack_channel` agent tool.
 */
export async function upsertMonitoredChannel(
  supabase: SupabaseClient,
  orgId: string,
  channelId: string,
  channelName?: string,
  triggers?: Partial<ChannelTriggers>
): Promise<MonitoredChannel> {
  const mergedTriggers: ChannelTriggers = {
    ...DEFAULT_TRIGGERS,
    ...(triggers ?? {}),
  };

  const { data, error } = await supabase
    .from('slack_monitored_channels')
    .upsert(
      {
        org_id: orgId,
        channel_id: channelId,
        channel_name: channelName ?? null,
        triggers: mergedTriggers,
      },
      { onConflict: 'org_id,channel_id' }
    )
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to upsert monitored channel: ${error?.message}`);
  }

  return data as MonitoredChannel;
}

/**
 * Remove a channel from monitoring.
 */
export async function removeMonitoredChannel(
  supabase: SupabaseClient,
  orgId: string,
  channelId: string
): Promise<void> {
  await supabase
    .from('slack_monitored_channels')
    .delete()
    .eq('org_id', orgId)
    .eq('channel_id', channelId);
}

/**
 * List all monitored channels for an org.
 */
export async function listMonitoredChannels(
  supabase: SupabaseClient,
  orgId: string
): Promise<MonitoredChannel[]> {
  const { data } = await supabase
    .from('slack_monitored_channels')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  return (data ?? []).map((row) => ({
    ...row,
    triggers: { ...DEFAULT_TRIGGERS, ...(row.triggers ?? {}) },
  })) as MonitoredChannel[];
}

// ---------------------------------------------------------------------------
// Trigger matching
// ---------------------------------------------------------------------------

/**
 * Decide whether a plain-text Slack message should trigger Cooper's response
 * given the channel's configured triggers.
 *
 * Rules (any match → triggered):
 * 1. Message contains a configured keyword (case-insensitive).
 * 2. Message contains a configured pattern string (case-insensitive).
 * 3. If `triggers.mentions` is true AND the message @mentions any user.
 */
export function shouldTrigger(text: string, triggers: ChannelTriggers): boolean {
  const lower = text.toLowerCase();

  // 1. Keywords
  for (const kw of triggers.keywords) {
    if (kw && lower.includes(kw.toLowerCase())) return true;
  }

  // 2. Patterns — built-in defaults: "error", "help", "?"
  for (const pat of triggers.patterns) {
    if (!pat) continue;
    // "?" is a special case — check if the message ends with a question mark
    // or contains a standalone "?" after stripping Slack format tokens.
    if (pat === '?') {
      const stripped = text.replace(/<[^>]+>/g, '').trim();
      if (stripped.endsWith('?') || stripped.includes('?')) return true;
    } else {
      if (lower.includes(pat.toLowerCase())) return true;
    }
  }

  // 3. User @mentions (<@U12345>)
  if (triggers.mentions && /<@[A-Z0-9]+>/.test(text)) return true;

  return false;
}
