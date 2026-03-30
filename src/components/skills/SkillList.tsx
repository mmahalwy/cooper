'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { SkillCard } from './SkillCard';
import { CreateSkillModal } from './CreateSkillModal';
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
              Teach Cooper how to do things your way. Describe a workflow in plain English.
            </p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Create skill
          </Button>
        </div>

        {loading && <p className="text-muted-foreground">Loading...</p>}

        {!loading && skills.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No skills yet. Create one to teach Cooper a workflow.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onDelete={handleDelete} />
          ))}
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
