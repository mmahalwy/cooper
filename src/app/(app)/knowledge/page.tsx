import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getKnowledgeForOrg } from '@/modules/memory/knowledge';
import { KnowledgeList } from '@/components/knowledge/KnowledgeList';

export default async function KnowledgePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) redirect('/auth/login');

  const facts = await getKnowledgeForOrg(supabase, dbUser.org_id);

  return <KnowledgeList initialFacts={facts} />;
}
