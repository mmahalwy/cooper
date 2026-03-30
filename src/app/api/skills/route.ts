import { createClient } from '@/lib/supabase/server';
import { getSkillsForOrg, createSkill, deleteSkill } from '@/modules/skills/db';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const skills = await getSkillsForOrg(supabase, dbUser.org_id);
  return Response.json(skills);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const body = await req.json();
  const { name, description, trigger, steps, tools, output_format } = body;

  if (!name || !description || !trigger) {
    return new Response('Missing required fields', { status: 400 });
  }

  const skill = await createSkill(supabase, {
    org_id: dbUser.org_id,
    name,
    description,
    trigger,
    steps: steps || [],
    tools: tools || [],
    output_format,
    created_by: 'user',
  });

  if (!skill) return new Response('Failed to create skill', { status: 500 });
  return Response.json(skill, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const success = await deleteSkill(supabase, id);
  if (!success) return new Response('Failed to delete', { status: 500 });
  return Response.json({ success: true });
}
