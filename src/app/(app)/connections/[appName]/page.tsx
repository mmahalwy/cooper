import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getConnectionToolsAction } from '@/app/actions';
import { getIntegrations } from '@/lib/integrations-catalog.server';
import { ConnectionDetail } from '@/components/connections/ConnectionDetail';

export default async function ConnectionDetailPage({ params }: { params: Promise<{ appName: string }> }) {
  const { appName } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const [integrations, tools] = await Promise.all([
    getIntegrations(),
    getConnectionToolsAction(appName),
  ]);

  const integration = integrations.find((i) => i.composioApp === appName || i.id === appName);

  return (
    <ConnectionDetail
      appName={appName}
      displayName={integration?.name || appName}
      description={integration?.description || ''}
      tools={tools}
    />
  );
}
