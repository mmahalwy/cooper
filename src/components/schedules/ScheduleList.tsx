'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { ScheduleCard } from './ScheduleCard';
import { CreateScheduleModal } from './CreateScheduleModal';
import type { ScheduledTask } from '@/lib/types';

export function ScheduleList() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    const res = await fetch('/api/schedules');
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadTasks(); }, []);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/schedules?id=${id}`, { method: 'DELETE' });
    if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToggle = async (id: string, status: 'active' | 'paused') => {
    const res = await fetch('/api/schedules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Schedules</h2>
            <p className="text-sm text-muted-foreground">
              Automated tasks that Cooper runs on a schedule.
            </p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Create schedule
          </Button>
        </div>

        {loading && <p className="text-muted-foreground">Loading...</p>}

        {!loading && tasks.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No schedules yet. Create one to automate a recurring task.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <ScheduleCard key={task.id} task={task} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      </div>

      <CreateScheduleModal opened={modalOpened} onClose={() => setModalOpened(false)} onCreated={loadTasks} />
    </>
  );
}
