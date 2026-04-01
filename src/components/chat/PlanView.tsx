'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  XCircleIcon,
  SkipForwardIcon,
  TargetIcon,
} from 'lucide-react';
import { approvePlanAction, cancelPlanAction, getPlanAction } from '@/app/actions';
import type { PlanStep } from '@/lib/types';
import { cn } from '@/lib/utils';

function StepIcon({ status }: { status: PlanStep['status'] }) {
  switch (status) {
    case 'done': return <CheckCircle2Icon className="size-4 text-green-500" />;
    case 'running': return <Loader2Icon className="size-4 text-blue-500 animate-spin" />;
    case 'failed': return <XCircleIcon className="size-4 text-red-500" />;
    case 'skipped': return <SkipForwardIcon className="size-4 text-muted-foreground" />;
    default: return <CircleIcon className="size-4 text-muted-foreground/50" />;
  }
}

interface PlanViewProps {
  planId: string;
}

export function PlanView({ planId }: PlanViewProps) {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPlanAction(planId).then(p => { if (p) setPlan(p); });

    const interval = setInterval(async () => {
      const p = await getPlanAction(planId);
      if (p) {
        setPlan(p);
        if (p.status === 'completed' || p.status === 'failed') {
          clearInterval(interval);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [planId]);

  const handleApprove = async () => {
    setLoading(true);
    await approvePlanAction(planId);
    const p = await getPlanAction(planId);
    if (p) setPlan(p);
    setLoading(false);
  };

  const handleCancel = async () => {
    setLoading(true);
    await cancelPlanAction(planId);
    const p = await getPlanAction(planId);
    if (p) setPlan(p);
    setLoading(false);
  };

  if (!plan) return null;

  const completedCount = plan.steps.filter((s: PlanStep) => s.status === 'done').length;

  return (
    <Card className="mt-2">
      <CardContent className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <TargetIcon className="size-4 mt-0.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{plan.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount}/{plan.steps.length} steps · {plan.status}
            </p>
          </div>
        </div>

        <div className="space-y-2 ml-1">
          {plan.steps.map((step: PlanStep, i: number) => (
            <div
              key={step.id}
              className={cn(
                'flex items-start gap-2 text-sm',
                step.status === 'pending' && 'opacity-50',
                step.status === 'skipped' && 'opacity-40 line-through',
              )}
            >
              <span className="mt-0.5 shrink-0"><StepIcon status={step.status} /></span>
              <div className="flex-1 min-w-0">
                <span>{step.description}</span>
                {step.tool_hint && <span className="ml-1.5 text-xs text-muted-foreground">({step.tool_hint})</span>}
                {step.output && <p className="text-xs text-muted-foreground mt-0.5">{step.output}</p>}
              </div>
            </div>
          ))}
        </div>

        {plan.status === 'draft' && (
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApprove} disabled={loading}>
              {loading ? 'Approving...' : 'Approve & Execute'}
            </Button>
          </div>
        )}

        {plan.status === 'completed' && (
          <p className="text-xs text-green-600 mt-3">✅ Plan completed</p>
        )}
        {plan.status === 'failed' && (
          <p className="text-xs text-red-600 mt-3">❌ Plan failed or cancelled</p>
        )}
      </CardContent>
    </Card>
  );
}
