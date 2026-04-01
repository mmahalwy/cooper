'use client';

import { useEffect, useState, useRef } from 'react';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { cn } from '@/lib/utils';

const STATUS_MESSAGES = [
  { after: 0, text: 'Thinking...' },
  { after: 3000, text: 'Working on it...' },
  { after: 8000, text: 'Digging deeper...' },
  { after: 15000, text: 'Almost there...' },
  { after: 30000, text: 'This is taking a bit longer than usual...' },
];

interface StreamingStatusProps {
  status: string; // 'submitted' | 'streaming' | 'ready' | 'error'
  currentTool?: string; // Human-friendly name of the currently executing tool
}

export function StreamingStatus({ status, currentTool }: StreamingStatusProps) {
  const [elapsed, setElapsed] = useState(0);
  const prevStatusRef = useRef(status);

  // Reset timer when status transitions to active
  useEffect(() => {
    if (
      (status === 'submitted' || status === 'streaming') &&
      prevStatusRef.current !== 'submitted' &&
      prevStatusRef.current !== 'streaming'
    ) {
      setElapsed(0);
    }
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status !== 'submitted' && status !== 'streaming') {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((e) => e + 1000), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === 'ready' || status === 'error') return null;

  // Use tool-specific status if available
  if (currentTool) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <BouncingDots />
        <span>{currentTool}</span>
      </div>
    );
  }

  // Fallback to time-based messages
  const msg = STATUS_MESSAGES.filter((m) => elapsed >= m.after).pop();

  return <Shimmer>{msg?.text || 'Thinking...'}</Shimmer>;
}

function BouncingDots() {
  return (
    <div className="flex gap-1">
      <span className="animate-bounce [animation-delay:0ms] size-1.5 rounded-full bg-primary" />
      <span className="animate-bounce [animation-delay:150ms] size-1.5 rounded-full bg-primary" />
      <span className="animate-bounce [animation-delay:300ms] size-1.5 rounded-full bg-primary" />
    </div>
  );
}
