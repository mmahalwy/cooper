'use client';

import { useEffect, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getActivityAction } from '@/app/actions';
import { useRouter } from 'next/navigation';
import {
  WrenchIcon,
  CalendarClockIcon,
  BrainIcon,
  ZapIcon,
  MessageSquareIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  ActivityIcon,
} from 'lucide-react';

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  metadata: Record<string, unknown>;
  thread_id: string | null;
  created_at: string;
  threads?: { title: string } | null;
}

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  tool_call: { icon: WrenchIcon, color: 'text-blue-500', label: 'Tool Call' },
  schedule_run: { icon: CalendarClockIcon, color: 'text-purple-500', label: 'Scheduled Run' },
  memory_stored: { icon: BrainIcon, color: 'text-green-500', label: 'Memory' },
  skill_created: { icon: ZapIcon, color: 'text-amber-500', label: 'Skill' },
  thread_created: { icon: MessageSquareIcon, color: 'text-cyan-500', label: 'Thread' },
  error: { icon: AlertTriangleIcon, color: 'text-red-500', label: 'Error' },
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function loadActivity() {
    startTransition(async () => {
      const data = await getActivityAction(100);
      setItems(data);
    });
  }

  useEffect(() => { loadActivity(); }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Activity</h1>
          <p className="text-sm text-muted-foreground">Everything Cooper has been doing</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadActivity} disabled={isPending}>
          <RefreshCwIcon className={`size-4 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <ActivityIcon className="size-10" />
            <p className="text-sm">No activity yet. Start chatting to see Cooper in action.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {items.map((item, i) => {
              const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.tool_call;
              const Icon = config.icon;
              const isLast = i === items.length - 1;

              return (
                <div key={item.id} className="flex gap-3">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ${config.color}`}>
                      <Icon className="size-4" />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-border" />}
                  </div>

                  {/* Content */}
                  <div className="pb-6 pt-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="secondary" className="text-[10px]">{config.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{timeAgo(item.created_at)}</span>
                    </div>
                    <p className="text-sm">{item.description}</p>
                    {item.thread_id && item.threads?.title && (
                      <button
                        onClick={() => router.push(`/chat/${item.thread_id}`)}
                        className="text-xs text-muted-foreground hover:text-foreground mt-0.5 hover:underline"
                      >
                        in: {item.threads.title}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
