'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusIcon, MessageSquareIcon, LogOutIcon, PlugIcon } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Thread } from '@/lib/types';

export function ChatSidebar() {
  const router = useRouter();
  const params = useParams();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function loadThreads() {
      const { data } = await supabase
        .from('threads')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (data) setThreads(data);
    }

    loadThreads();

    const channel = supabase
      .channel('threads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'threads' },
        () => loadThreads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex h-full flex-col gap-2">
      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => router.push('/chat')}
      >
        <PlusIcon data-icon="inline-start" />
        New chat
      </Button>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 py-2">
          {threads.length === 0 && (
            <p className="px-2 text-xs text-muted-foreground">No conversations yet</p>
          )}
          {threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => router.push(`/chat/${thread.id}`)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                params?.threadId === thread.id && 'bg-accent'
              )}
            >
              <MessageSquareIcon className="size-4 shrink-0" />
              <span className="truncate">{thread.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      </ScrollArea>

      <div className="flex flex-col gap-1 border-t pt-2">
        <button
          onClick={() => router.push('/connections')}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
        >
          <PlugIcon className="size-4" />
          Connections
        </button>
        <button
          onClick={() => {
            fetch('/auth/signout', { method: 'POST' }).then(() => {
              window.location.href = '/auth/login';
            });
          }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
        >
          <LogOutIcon className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
