import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PersonaSettings } from '@/components/settings/PersonaSettings';

export default async function PersonaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return <PersonaSettings />;
}
