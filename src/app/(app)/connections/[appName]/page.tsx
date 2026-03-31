import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getConnectionToolsAction } from '@/app/actions';
import { INTEGRATIONS } from '@/lib/integrations-catalog';
import { ConnectionDetail } from '@/components/connections/ConnectionDetail';

export default async function ConnectionDetailPage({ params }: { params: Promise<{ appName: string }> }) {
  const { appName } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const integration = INTEGRATIONS.find((i) => i.composioApp === appName || i.id === appName);
  const tools = await getConnectionToolsAction(appName);

  return (
    <ConnectionDetail
      appName={appName}
      displayName={integration?.name || appName}
      description={integration?.description || ''}
      tools={tools}
    />
  );
}
