import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { IntegrationsCatalog } from '@/components/connections/IntegrationsCatalog';

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) redirect('/auth/login');

  const { data: connections } = await supabase
    .from('connections')
    .select('*')
    .eq('org_id', dbUser.org_id)
    .order('created_at', { ascending: false });

  return <IntegrationsCatalog initialConnections={connections || []} />;
}
