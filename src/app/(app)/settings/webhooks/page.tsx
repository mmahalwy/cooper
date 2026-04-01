import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { WebhookManagement } from '@/components/settings/WebhookManagement';

export default async function WebhooksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return <WebhookManagement />;
}
