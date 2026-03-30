import { createClient } from '@/lib/supabase/server';
import { parseSkillFromNL } from '@/modules/skills/parser';
import { getToolsForOrg } from '@/modules/connections/registry';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const { description } = await req.json();
  if (!description) return new Response('Missing description', { status: 400 });

  const tools = await getToolsForOrg(supabase, dbUser.org_id);
  const toolNames = Object.keys(tools);

  const parsed = await parseSkillFromNL(description, toolNames);
  return Response.json(parsed);
}
