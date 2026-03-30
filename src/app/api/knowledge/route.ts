import { createClient } from '@/lib/supabase/server';
import { getKnowledgeForOrg, addKnowledge, deleteKnowledge } from '@/modules/memory/knowledge';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const facts = await getKnowledgeForOrg(supabase, dbUser.org_id);
  return Response.json(facts);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const { content } = await req.json();
  if (!content) return new Response('Missing content', { status: 400 });

  const fact = await addKnowledge(supabase, dbUser.org_id, content);
  if (!fact) return new Response('Failed to add knowledge', { status: 500 });

  return Response.json(fact, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const success = await deleteKnowledge(supabase, id);
  if (!success) return new Response('Failed to delete', { status: 500 });

  return Response.json({ success: true });
}
