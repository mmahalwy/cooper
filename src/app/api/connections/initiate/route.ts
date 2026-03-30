import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { appName } = await req.json();
  if (!appName) return new Response('Missing appName', { status: 400 });

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return new Response('Composio not configured', { status: 500 });

  // Use Composio raw API to initiate OAuth connection
  const resp = await fetch('https://backend.composio.dev/api/v2/connectedAccounts/initiateConnection', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      integrationId: appName,
      entityId: user.id, // Use the actual user ID as the Composio entity
      redirectUri: `${req.headers.get('origin') || 'http://localhost:3000'}/connections`,
    }),
  });

  const data = await resp.json();

  if (data.connectionResponse?.redirectUrl) {
    return Response.json({
      redirectUrl: data.connectionResponse.redirectUrl,
      connectionStatus: data.connectionResponse.connectionStatus,
      connectedAccountId: data.connectionResponse.connectedAccountId,
    });
  }

  return new Response(JSON.stringify(data), { status: 400 });
}
