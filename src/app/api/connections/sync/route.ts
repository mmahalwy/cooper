import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return new Response('Composio not configured', { status: 500 });

  try {
    // Fetch all active connected accounts from Composio
    const resp = await fetch('https://backend.composio.dev/api/v1/connectedAccounts?showActiveOnly=true', {
      headers: { 'x-api-key': apiKey },
    });
    const data = await resp.json();
    const connectedApps = (data.items || []) as Array<{ appName: string; status: string; id: string }>;

    // Get unique app names that are active
    const activeApps = [...new Set(connectedApps.filter(c => c.status === 'ACTIVE').map(c => c.appName))];

    // Get existing connections from our DB
    const { data: existingConnections } = await supabase
      .from('connections')
      .select('provider')
      .eq('org_id', dbUser.org_id)
      .eq('type', 'platform');

    const existingProviders = new Set((existingConnections || []).map((c: any) => c.provider));

    let synced = 0;
    for (const appName of activeApps) {
      if (existingProviders.has(appName)) continue;

      await supabase.from('connections').insert({
        org_id: dbUser.org_id,
        type: 'platform',
        name: appName,
        provider: appName,
        config: { apps: [appName] },
        status: 'active',
      });
      synced++;
    }

    return Response.json({ synced, activeApps, total: connectedApps.length });
  } catch (error) {
    console.error('[connections/sync] Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
