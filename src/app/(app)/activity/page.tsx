import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ActivityFeed } from '@/components/activity/ActivityFeed';

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return <ActivityFeed />;
}
