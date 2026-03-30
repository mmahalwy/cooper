import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { appName, authConfig } = await req.json();
  if (!appName) return new Response('Missing appName', { status: 400 });

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return new Response('Composio not configured', { status: 500 });

  // Step 1: Find the integration for this app
  const integrationsResp = await fetch('https://backend.composio.dev/api/v1/integrations', {
    headers: { 'x-api-key': apiKey },
  });
  const integrationsData = await integrationsResp.json();
  const integration = (integrationsData.items || []).find(
    (i: any) => i.appName === appName
  );

  if (!integration) {
    return new Response(`Integration not found for app: ${appName}. Set it up in Composio dashboard first.`, { status: 404 });
  }

  // Step 2: Initiate connection — handle both OAuth and API_KEY auth
  const body: Record<string, unknown> = {
    integrationId: integration.id,
    entityId: user.id,
  };

  if (integration.authScheme === 'API_KEY' && authConfig) {
    // API key auth — pass the credentials directly
    body.data = authConfig;
  } else {
    // OAuth — include redirect URI
    body.redirectUri = `${req.headers.get('origin') || 'http://localhost:3000'}/connections`;
  }

  const resp = await fetch('https://backend.composio.dev/api/v2/connectedAccounts/initiateConnection', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();

  return Response.json({
    authScheme: integration.authScheme,
    redirectUrl: data.connectionResponse?.redirectUrl || null,
    connectionStatus: data.connectionResponse?.connectionStatus || data.status,
    connectedAccountId: data.connectionResponse?.connectedAccountId || data.id,
  });
}
