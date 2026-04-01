'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { GitBranchIcon } from 'lucide-react';
import { branchThreadAction } from '@/app/actions';
import { useRouter } from 'next/navigation';

export function BranchButton({ threadId, messageId }: { threadId: string; messageId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
      title="Branch from here"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await branchThreadAction(threadId, messageId);
          if ('threadId' in result) {
            router.push(`/chat/${result.threadId}`);
          }
        });
      }}
    >
      <GitBranchIcon className="size-3" />
    </Button>
  );
}
