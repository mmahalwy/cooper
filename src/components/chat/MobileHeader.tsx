'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ArrowLeftIcon, MenuIcon } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';

export function MobileHeader({ title }: { title?: string }) {
  const router = useRouter();
  const params = useParams();
  const isThread = !!params?.threadId;

  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
      {isThread ? (
        <Button variant="ghost" size="sm" onClick={() => router.push('/chat')}>
          <ArrowLeftIcon className="size-4" />
        </Button>
      ) : (
        <SidebarTrigger />
      )}
      <span className="text-sm font-medium truncate flex-1">
        {title || 'Cooper'}
      </span>
    </div>
  );
}
