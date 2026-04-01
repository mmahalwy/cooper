import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ApiKeysManagement } from '@/components/settings/ApiKeysManagement';

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return <ApiKeysManagement />;
}
