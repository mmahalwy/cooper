import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamManagement } from '@/components/team/TeamManagement';

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return <TeamManagement />;
}
