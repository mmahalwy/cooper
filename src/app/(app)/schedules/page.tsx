import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getScheduledTasksForOrg } from '@/modules/scheduler/db';
import { ScheduleList } from '@/components/schedules/ScheduleList';

export default async function SchedulesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) redirect('/auth/login');

  const tasks = await getScheduledTasksForOrg(supabase, dbUser.org_id);

  return <ScheduleList initialTasks={tasks} />;
}
