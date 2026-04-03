import { createServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/slack/callback?code=...
 *
 * Handles the OAuth 2.0 redirect from Slack after a user installs Cooper.
 * Exchanges the one-time `code` for a bot access token and persists the
 * installation to the `slack_installations` table.
 *
 * Query params:
 *   code  — one-time authorization code from Slack
 *   error — present when the user denied the install
 *   state — optional opaque value we set during /install (e.g. org_id)
 */
export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const state = url.searchParams.get('state'); // org_id passed through state param

  // User declined the install
  if (error) {
    console.warn('[slack/callback] OAuth error:', error);
    return Response.redirect(`${appUrl}/settings?slack_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return Response.redirect(`${appUrl}/settings?slack_error=missing_code`);
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[slack/callback] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET');
    return Response.redirect(`${appUrl}/settings?slack_error=server_misconfigured`);
  }

  // Exchange code for access token
  const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${appUrl}/api/slack/callback`,
    }),
  });

  const data = await tokenResponse.json();

  if (!data.ok) {
    console.error('[slack/callback] oauth.v2.access failed:', data.error);
    return Response.redirect(`${appUrl}/settings?slack_error=oauth_failed`);
  }

  // Persist the installation
  const supabase = createServiceClient();

  const { error: dbError } = await supabase.from('slack_installations').upsert(
    {
      team_id: data.team.id,
      bot_token: data.access_token,
      bot_user_id: data.bot_user_id,
      // org_id: use state param when passed (e.g. from settings page "Add to Slack" button)
      ...(state ? { org_id: state } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'team_id' }
  );

  if (dbError) {
    console.error('[slack/callback] Failed to save installation:', dbError);
    return Response.redirect(`${appUrl}/settings?slack_error=db_error`);
  }

  console.log('[slack/callback] Installation saved for team:', data.team.id);
  return Response.redirect(`${appUrl}/settings?slack_connected=true`);
}
