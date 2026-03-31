import { createClient } from '@/lib/supabase/server';
import { Composio } from '@composio/core';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { appName } = await req.json();
  if (!appName) return new Response('Missing appName', { status: 400 });

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return new Response('Composio not configured', { status: 500 });

  try {
    const composio = new Composio({ apiKey });
    const session = await composio.create(user.id);

    const origin = req.headers.get('origin') || 'http://localhost:3000';

    const connectionRequest = await session.authorize(appName, {
      callbackUrl: `${origin}/connections`,
    });

    return Response.json({
      redirectUrl: connectionRequest.redirectUrl || null,
      connectedAccountId: (connectionRequest as any).id,
    });
  } catch (error) {
    console.error('[connections/initiate] Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
