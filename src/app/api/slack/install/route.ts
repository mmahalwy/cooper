/**
 * GET /api/slack/install
 *
 * Initiates the Slack OAuth 2.0 install flow by redirecting the browser to
 * Slack's authorization page.  After the user grants permissions, Slack
 * redirects back to /api/slack/callback with a one-time `code`.
 */
export async function GET() {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return new Response('SLACK_CLIENT_ID is not configured', { status: 500 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/slack/callback`;

  // Bot token scopes required for Cooper to function.
  // Keep this list in sync with the Slack app manifest.
  const scopes = [
    'app_mentions:read',
    'channels:history',
    'channels:read',
    'chat:write',
    'commands',
    'files:read',
    'files:write',
    'groups:history',
    'im:history',
    'im:read',
    'im:write',
    'mpim:history',
    'reactions:read',
    'reactions:write',
    'users:read',
    'users:read.email',
  ].join(',');

  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('redirect_uri', redirectUri);

  return Response.redirect(url.toString());
}
