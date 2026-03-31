import { createClient } from '@/lib/supabase/server';
import { Composio } from '@composio/core';

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
    const composio = new Composio({ apiKey });
    const session = await composio.create(user.id);
    const toolkits = await session.toolkits();

    // Get existing connections from our DB
    const { data: existingConnections } = await supabase
      .from('connections')
      .select('provider')
      .eq('org_id', dbUser.org_id)
      .eq('type', 'platform');

    const existingProviders = new Set((existingConnections || []).map((c: any) => c.provider));

    let synced = 0;

    // Add any new Composio connections to our DB
    for (const toolkit of (toolkits as any)?.items || []) {
      const appName = toolkit.slug || toolkit.name;
      if (!appName || existingProviders.has(appName)) continue;

      // Only add if it has an active connection
      if (toolkit.connection?.connectedAccount) {
        await supabase.from('connections').insert({
          org_id: dbUser.org_id,
          type: 'platform',
          name: toolkit.displayName || appName,
          provider: appName,
          config: { apps: [appName] },
          status: 'active',
        });
        synced++;
      }
    }

    return Response.json({ synced, total: (toolkits as any)?.items?.length || 0 });
  } catch (error) {
    console.error('[connections/sync] Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
