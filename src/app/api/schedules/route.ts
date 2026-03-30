import { createClient } from '@/lib/supabase/server';
import {
  getScheduledTasksForOrg,
  createScheduledTask,
  deleteScheduledTask,
  updateScheduledTaskStatus,
} from '@/modules/scheduler/db';
import { getNextRunTime } from '@/modules/scheduler/matcher';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const tasks = await getScheduledTasksForOrg(supabase, dbUser.org_id);
  return Response.json(tasks);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const body = await req.json();
  const { name, cron, prompt } = body;

  if (!name || !cron || !prompt) {
    return new Response('Missing required fields: name, cron, prompt', { status: 400 });
  }

  let nextRunAt: string;
  try {
    nextRunAt = getNextRunTime(cron).toISOString();
  } catch {
    return new Response('Invalid cron expression', { status: 400 });
  }

  const task = await createScheduledTask(supabase, {
    org_id: dbUser.org_id,
    user_id: user.id,
    name,
    cron,
    prompt,
    next_run_at: nextRunAt,
  });

  if (!task) return new Response('Failed to create schedule', { status: 500 });
  return Response.json(task, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id, status } = await req.json();
  if (!id || !status) return new Response('Missing id or status', { status: 400 });

  await updateScheduledTaskStatus(supabase, id, status);
  return Response.json({ success: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const success = await deleteScheduledTask(supabase, id);
  if (!success) return new Response('Failed to delete', { status: 500 });
  return Response.json({ success: true });
}
