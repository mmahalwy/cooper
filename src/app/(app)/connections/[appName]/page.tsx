import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getIntegrations } from '@/lib/integrations-catalog.server';
import { ConnectionDetail } from '@/components/connections/ConnectionDetail';

export default async function ConnectionDetailPage({ params }: { params: Promise<{ appName: string }> }) {
  const { appName } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) redirect('/auth/login');

  const { data: connection } = await supabase
    .from('connections')
    .select('id, config, scope')
    .eq('org_id', dbUser.org_id)
    .eq('provider', appName)
    .eq('status', 'active')
    .single();

  const integrations = await getIntegrations();
  const integration = integrations.find((i) => i.composioApp === appName || i.id === appName);
  const savedPermissions = (connection?.config as any)?.toolPermissions || {};

  // Tools are loaded client-side in ConnectionDetail to avoid blocking the page
  return (
    <ConnectionDetail
      appName={appName}
      connectionId={connection?.id || null}
      displayName={integration?.name || appName}
      description={integration?.description || ''}
      savedPermissions={savedPermissions}
      scope={connection?.scope || 'shared'}
    />
  );
}
