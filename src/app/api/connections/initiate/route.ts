import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { appName, authConfig } = await req.json();
  if (!appName) return new Response('Missing appName', { status: 400 });

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return new Response('Composio not configured', { status: 500 });

  try {
    // Step 1: Find the integration for this app
    const integrationsResp = await fetch('https://backend.composio.dev/api/v1/integrations', {
      headers: { 'x-api-key': apiKey },
    });
    const integrationsData = await integrationsResp.json();
    const integration = (integrationsData.items || []).find(
      (i: any) => i.appName === appName
    );

    if (!integration) {
      // Integration doesn't exist yet — create one first
      const createResp = await fetch('https://backend.composio.dev/api/v1/integrations', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appName, name: appName }),
      });
      const created = await createResp.json();
      if (!created.id) {
        return Response.json({ error: `Could not create integration for ${appName}`, details: created }, { status: 400 });
      }
      return await initiateConnection(apiKey, created.id, created.authScheme, user.id, req, authConfig);
    }

    return await initiateConnection(apiKey, integration.id, integration.authScheme, user.id, req, authConfig);
  } catch (error) {
    console.error('[connections/initiate] Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

async function initiateConnection(
  apiKey: string,
  integrationId: string,
  authScheme: string,
  userId: string,
  req: Request,
  authConfig?: Record<string, string>
) {
  const body: Record<string, unknown> = {
    integrationId,
    entityId: userId,
  };

  if (authScheme === 'API_KEY' && authConfig) {
    body.data = authConfig;
  } else {
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
    authScheme,
    redirectUrl: data.connectionResponse?.redirectUrl || null,
    connectionStatus: data.connectionResponse?.connectionStatus || data.status,
    connectedAccountId: data.connectionResponse?.connectedAccountId || data.id,
  });
}
