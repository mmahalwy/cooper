import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { UsageDashboard } from '@/components/usage/UsageDashboard';

export default async function UsagePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return <UsageDashboard />;
}
