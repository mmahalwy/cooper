import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebClient } from '@slack/web-api';

interface ResolvedUser {
  userId: string;
  orgId: string;
}

export async function resolveSlackUser(
  supabase: SupabaseClient,
  slackClient: WebClient,
  slackUserId: string,
  slackTeamId: string,
  orgId: string
): Promise<ResolvedUser | null> {
  // Check existing mapping
  const { data: existing } = await supabase
    .from('slack_user_mappings')
    .select('user_id, org_id')
    .eq('slack_user_id', slackUserId)
    .eq('slack_team_id', slackTeamId)
    .single();

  if (existing) {
    return { userId: existing.user_id, orgId: existing.org_id };
  }

  // Auto-provision: fetch Slack profile and create Cooper user
  let email: string;
  let name: string;
  try {
    const profile = await slackClient.users.info({ user: slackUserId });
    email = profile.user?.profile?.email || `${slackUserId}@slack.local`;
    name = profile.user?.real_name || profile.user?.name || slackUserId;
  } catch (err) {
    console.error('[slack] Failed to fetch user profile:', slackUserId, err);
    email = `${slackUserId}@slack.local`;
    name = slackUserId;
  }

  // Generate a deterministic UUID from the Slack identity
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(`slack:${slackTeamId}:${slackUserId}`).digest('hex');
  const syntheticUserId = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');

  // Insert into users table (ignore conflict if already exists)
  const { error: userError } = await supabase
    .from('users')
    .upsert({
      id: syntheticUserId,
      org_id: orgId,
      email,
      name,
      role: 'member',
    }, { onConflict: 'id' });

  if (userError) {
    console.error('[slack] Failed to create user:', userError);
    return null;
  }

  // Create the mapping
  await supabase.from('slack_user_mappings').insert({
    slack_user_id: slackUserId,
    slack_team_id: slackTeamId,
    user_id: syntheticUserId,
    org_id: orgId,
  });

  return { userId: syntheticUserId, orgId };
}
