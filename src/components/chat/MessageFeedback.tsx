'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUpIcon, ThumbsDownIcon } from 'lucide-react';
import { submitFeedbackAction } from '@/app/actions';

export function MessageFeedback({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFeedback(newRating: 'positive' | 'negative') {
    if (rating === newRating) return;
    setRating(newRating);
    startTransition(async () => {
      await submitFeedbackAction(messageId, newRating);
    });
  }

  return (
    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${rating === 'positive' ? 'text-green-500 opacity-100' : ''}`}
        onClick={() => handleFeedback('positive')}
        disabled={isPending}
      >
        <ThumbsUpIcon className="size-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${rating === 'negative' ? 'text-red-500 opacity-100' : ''}`}
        onClick={() => handleFeedback('negative')}
        disabled={isPending}
      >
        <ThumbsDownIcon className="size-3" />
      </Button>
    </div>
  );
}
