'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2Icon,
  Loader2Icon,
  XCircleIcon,
  HammerIcon,
} from 'lucide-react';
import { getDeepWorkStatusAction } from '@/app/actions/deep-work';
import { cn } from '@/lib/utils';

interface DeepWorkProgressProps {
  threadId: string;
}

interface DeepWorkData {
  status: string;
  goal: string;
  completedSteps: number;
  totalSteps: number;
  currentStep: string;
  results: Array<{ step: string; result: string }>;
  errors: Array<{ step: string; error: string }>;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2Icon className="size-4 text-green-500" />;
    case 'failed':
      return <XCircleIcon className="size-4 text-red-500" />;
    default:
      return <Loader2Icon className="size-4 text-blue-500 animate-spin" />;
  }
}

export function DeepWorkProgress({ threadId }: DeepWorkProgressProps) {
  const [data, setData] = useState<DeepWorkData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await getDeepWorkStatusAction(threadId);
      if (!cancelled && result) {
        setData(result);
        // Stop polling when done
        if (result.status === 'completed' || result.status === 'failed') return;
      }
      if (!cancelled) {
        setTimeout(poll, 2000);
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [threadId]);

  if (!data) return null;

  const progress = data.totalSteps > 0
    ? Math.round((data.completedSteps / data.totalSteps) * 100)
    : 0;

  return (
    <Card className="mt-2">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon status={data.status} />
            <span className="font-medium text-sm">
              <HammerIcon className="size-3.5 inline mr-1" />
              Deep Work: {data.goal}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {data.completedSteps}/{data.totalSteps} steps
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              data.status === 'failed' ? 'bg-red-500' : 'bg-primary',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {data.status === 'running' && (
          <p className="text-xs text-muted-foreground">
            Currently: {data.currentStep}
          </p>
        )}

        {data.results.length > 0 && (
          <div className="space-y-1 mt-2">
            {data.results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                <span className="text-muted-foreground">{r.step}</span>
              </div>
            ))}
          </div>
        )}

        {data.errors.length > 0 && (
          <div className="space-y-1 mt-2">
            {data.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-red-500 mt-0.5 shrink-0">✗</span>
                <span className="text-muted-foreground">{e.step}: {e.error}</span>
              </div>
            ))}
          </div>
        )}

        {data.status === 'completed' && (
          <p className="text-xs text-green-600 mt-2">✅ Deep work completed</p>
        )}
        {data.status === 'failed' && (
          <p className="text-xs text-red-600 mt-2">
            ⚠️ Deep work finished with errors ({data.errors.length} issue{data.errors.length !== 1 ? 's' : ''})
          </p>
        )}
      </CardContent>
    </Card>
  );
}
