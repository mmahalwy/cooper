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
  // 1. Check existing Slack → Cooper user mapping
  const { data: existing } = await supabase
    .from('slack_user_mappings')
    .select('user_id, org_id')
    .eq('slack_user_id', slackUserId)
    .eq('slack_team_id', slackTeamId)
    .single();

  if (existing) {
    return { userId: existing.user_id, orgId: existing.org_id };
  }

  // 2. Fetch Slack profile to get email
  let email: string | null = null;
  let name: string = slackUserId;
  try {
    const profile = await slackClient.users.info({ user: slackUserId });
    email = profile.user?.profile?.email || null;
    name = profile.user?.real_name || profile.user?.name || slackUserId;
  } catch (err) {
    console.error('[slack] Failed to fetch user profile:', slackUserId, err);
  }

  // 3. Try to match by email to an existing Cooper user
  if (email) {
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, org_id')
      .eq('email', email)
      .eq('org_id', orgId)
      .single();

    if (existingUser) {
      // Found a match — create the mapping for next time
      await supabase.from('slack_user_mappings').insert({
        slack_user_id: slackUserId,
        slack_team_id: slackTeamId,
        user_id: existingUser.id,
        org_id: existingUser.org_id,
      }); // ignore errors — mapping may already exist

      console.log(`[slack] Mapped Slack user ${slackUserId} (${email}) to existing user ${existingUser.id}`);
      return { userId: existingUser.id, orgId: existingUser.org_id };
    }
  }

  // 4. No existing user found — fall back to the org's first admin
  // We can't create auth.users entries directly, so we use an existing user
  // as the actor for this Slack interaction.
  const { data: fallbackUser } = await supabase
    .from('users')
    .select('id, org_id')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .limit(1)
    .single();

  if (fallbackUser) {
    // Create mapping so this Slack user is associated with the admin for now
    await supabase.from('slack_user_mappings').insert({
      slack_user_id: slackUserId,
      slack_team_id: slackTeamId,
      user_id: fallbackUser.id,
      org_id: fallbackUser.org_id,
    });

    console.warn(`[slack] WARN: Mapping external Slack user ${slackUserId} (${email || 'no email'}) to org admin ${fallbackUser.id} — they don't have a Cooper account`);
    return { userId: fallbackUser.id, orgId: fallbackUser.org_id };
  }

  console.error(`[slack] No users found in org ${orgId} for Slack user ${slackUserId}`);
  return null;
}
