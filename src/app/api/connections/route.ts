import { createClient } from '@/lib/supabase/server';
import {
  getConnectionsForOrg,
  createConnection,
  deleteConnection,
} from '@/modules/connections/db';
import { clearMcpClientCache } from '@/modules/connections/mcp/client';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    return new Response('User not found', { status: 404 });
  }

  const connections = await getConnectionsForOrg(supabase, dbUser.org_id);
  return Response.json(connections);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    return new Response('User not found', { status: 404 });
  }

  const body = await req.json();
  const { name, provider, type, config } = body as {
    name: string;
    provider: string;
    type: 'mcp' | 'custom' | 'platform';
    config: Record<string, unknown>;
  };

  if (!name || !provider || !type || !config) {
    return new Response('Missing required fields: name, provider, type, config', { status: 400 });
  }

  const connection = await createConnection(supabase, {
    org_id: dbUser.org_id,
    type,
    name,
    provider,
    config,
  });

  if (!connection) {
    return new Response('Failed to create connection', { status: 500 });
  }

  return Response.json(connection, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const connectionId = searchParams.get('id');

  if (!connectionId) {
    return new Response('Missing connection id', { status: 400 });
  }

  clearMcpClientCache(connectionId);

  const success = await deleteConnection(supabase, connectionId);

  if (!success) {
    return new Response('Failed to delete connection', { status: 500 });
  }

  return Response.json({ success: true });
}
