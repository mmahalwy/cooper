'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { ScheduleCard } from './ScheduleCard';
import { CreateScheduleModal } from './CreateScheduleModal';
import { deleteScheduleAction, toggleScheduleAction } from '@/app/actions';
import type { ScheduledTask } from '@/lib/types';

interface ScheduleListProps {
  initialTasks: ScheduledTask[];
}

export function ScheduleList({ initialTasks }: ScheduleListProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [modalOpened, setModalOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteScheduleAction(id);
      if (result.success) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }
    });
  };

  const handleToggle = (id: string, status: 'active' | 'paused') => {
    startTransition(async () => {
      const result = await toggleScheduleAction(id, status);
      if (result.success) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
      }
    });
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

        {tasks.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No schedules yet. Create one to automate a recurring task.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <ScheduleCard
              key={task.id}
              task={task}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>

      <CreateScheduleModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
