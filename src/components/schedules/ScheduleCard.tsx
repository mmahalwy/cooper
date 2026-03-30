'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClockIcon, TrashIcon, PauseIcon, PlayIcon } from 'lucide-react';
import type { ScheduledTask } from '@/lib/types';

interface ScheduleCardProps {
  task: ScheduledTask;
  onDelete: (id: string) => void;
  onToggle: (id: string, status: 'active' | 'paused') => void;
}

export function ScheduleCard({ task, onDelete, onToggle }: ScheduleCardProps) {
  const isActive = task.status === 'active';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ClockIcon className="size-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">{task.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{task.prompt}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={isActive ? 'default' : 'secondary'}>{task.status}</Badge>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{task.cron}</code>
                {task.next_run_at && (
                  <span className="text-xs text-muted-foreground">
                    Next: {new Date(task.next_run_at).toLocaleString()}
                  </span>
                )}
                {task.last_run_at && (
                  <span className="text-xs text-muted-foreground">
                    Last: {new Date(task.last_run_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8"
              onClick={() => onToggle(task.id, isActive ? 'paused' : 'active')}>
              {isActive ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-8 text-destructive"
              onClick={() => onDelete(task.id)}>
              <TrashIcon />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
