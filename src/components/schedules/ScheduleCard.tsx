'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClockIcon, TrashIcon, PauseIcon, PlayIcon, ChevronDownIcon, MessageSquareIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getScheduleRunsAction } from '@/app/actions';
import type { ScheduledTask } from '@/lib/types';

interface ScheduleRun {
  id: string;
  title: string | null;
  created_at: string;
}

interface ScheduleCardProps {
  task: ScheduledTask;
  onDelete: (id: string) => void;
  onToggle: (id: string, status: 'active' | 'paused') => void;
}

export function ScheduleCard({ task, onDelete, onToggle }: ScheduleCardProps) {
  const isActive = task.status === 'active';
  const router = useRouter();
  const [runsOpen, setRunsOpen] = useState(false);
  const [runs, setRuns] = useState<ScheduleRun[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggleRuns = async () => {
    if (!runsOpen && runs === null) {
      setLoading(true);
      const data = await getScheduleRunsAction(task.id);
      setRuns(data);
      setLoading(false);
    }
    setRunsOpen(!runsOpen);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ClockIcon className="size-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">{task.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.prompt}</p>
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

        <button
          onClick={handleToggleRuns}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDownIcon className={cn('size-3 transition-transform', runsOpen && 'rotate-180')} />
          {runsOpen ? 'Hide runs' : 'View runs'}
        </button>

        {runsOpen && (
          <div className="mt-2 border-t pt-2">
            {loading && <p className="text-xs text-muted-foreground py-2">Loading...</p>}
            {runs && runs.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No runs yet.</p>
            )}
            {runs && runs.length > 0 && (
              <div className="flex flex-col gap-1">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => router.push(`/chat/${run.id}`)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                  >
                    <MessageSquareIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">
                      {run.title?.replace('[Scheduled] ', '') || 'Run'}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
