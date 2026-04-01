'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  PlusIcon,
  MessageSquareIcon,
  PlugIcon,
  BrainIcon,
  ZapIcon,
  CalendarClockIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface RecentThread {
  id: string;
  title: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [recentThreads, setRecentThreads] = useState<RecentThread[]>([]);
  const router = useRouter();

  // Listen for Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      // Cmd+N → New chat
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        router.push('/chat');
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [router]);

  // Load recent threads when palette opens
  useEffect(() => {
    if (!open) return;

    const supabase = createClient();
    supabase
      .from('threads')
      .select('id, title')
      .is('scheduled_task_id', null)
      .order('updated_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (data) setRecentThreads(data.map(t => ({ id: t.id, title: t.title || 'Untitled' })));
      });
  }, [open]);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    []
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search conversations, navigate..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => router.push('/chat'))}>
            <PlusIcon className="mr-2 size-4" />
            <span>New Chat</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {recentThreads.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Conversations">
              {recentThreads.map((thread) => (
                <CommandItem
                  key={thread.id}
                  onSelect={() => runCommand(() => router.push(`/chat/${thread.id}`))}
                >
                  <MessageSquareIcon className="mr-2 size-4" />
                  <span className="truncate">{thread.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => runCommand(() => router.push('/connections'))}>
            <PlugIcon className="mr-2 size-4" />
            <span>Connections</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/knowledge'))}>
            <BrainIcon className="mr-2 size-4" />
            <span>Knowledge</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/skills'))}>
            <ZapIcon className="mr-2 size-4" />
            <span>Skills</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/schedules'))}>
            <CalendarClockIcon className="mr-2 size-4" />
            <span>Schedules</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
