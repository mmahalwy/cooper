import { createClient } from '@/lib/supabase/server';
import { parseScheduleFromNL } from '@/modules/scheduler/parser';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { description } = await req.json();
  if (!description) return new Response('Missing description', { status: 400 });

  const parsed = await parseScheduleFromNL(description);
  return Response.json(parsed);
}
