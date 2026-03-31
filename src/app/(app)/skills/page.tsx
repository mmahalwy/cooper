import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSkillsForOrg } from '@/modules/skills/db';
import { loadSystemSkills } from '@/modules/skills/system';
import { SkillList } from '@/components/skills/SkillList';

export default async function SkillsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) redirect('/auth/login');

  const [userSkills, systemSkills] = await Promise.all([
    getSkillsForOrg(supabase, dbUser.org_id),
    loadSystemSkills(),
  ]);

  return (
    <SkillList
      initialSkills={userSkills}
      systemSkills={systemSkills.map((s) => ({ name: s.name, description: s.description }))}
    />
  );
}
