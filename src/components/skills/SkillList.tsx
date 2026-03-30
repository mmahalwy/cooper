'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PlusIcon, ShieldIcon, ZapIcon } from 'lucide-react';
import { SkillCard } from './SkillCard';
import { CreateSkillModal } from './CreateSkillModal';
import { SYSTEM_SKILLS } from '@/modules/skills/system';
import type { Skill } from '@/lib/types';

export function SkillList() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadSkills() {
    const res = await fetch('/api/skills');
    if (res.ok) setSkills(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadSkills(); }, []);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/skills?id=${id}`, { method: 'DELETE' });
    if (res.ok) setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Skills</h2>
            <p className="text-sm text-muted-foreground">
              Cooper&apos;s built-in capabilities and your custom workflows.
            </p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Create skill
          </Button>
        </div>

        {/* System Skills */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ShieldIcon className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">System Skills</h3>
            <Badge variant="secondary" className="text-xs">{SYSTEM_SKILLS.length}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {SYSTEM_SKILLS.map((skill) => (
              <Card key={skill.name}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <ZapIcon className="size-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{skill.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="mt-2 text-[10px]">system</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Separator />

        {/* User Skills */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ZapIcon className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Your Skills</h3>
            <Badge variant="secondary" className="text-xs">{skills.length}</Badge>
          </div>

          {loading && <p className="text-muted-foreground">Loading...</p>}

          {!loading && skills.length === 0 && (
            <p className="text-center text-muted-foreground py-6">
              No custom skills yet. Create one to teach Cooper a workflow specific to your team.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      </div>

      <CreateSkillModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onCreated={loadSkills}
      />
    </>
  );
}
