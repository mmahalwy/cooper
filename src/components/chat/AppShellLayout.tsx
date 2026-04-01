'use client';

import { CommandPalette } from '@/components/command-palette/CommandPalette';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PlusIcon,
  MessageSquareIcon,
  PlugIcon,
  BrainIcon,
  ZapIcon,
  CalendarClockIcon,
  BarChart3Icon,
  ActivityIcon,
  LogOutIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { searchThreadsAction } from '@/app/actions';
import { Input } from '@/components/ui/input';
import { useRouter, useParams } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Thread } from '@/lib/types';

function AppSidebar() {
  const router = useRouter();
  const params = useParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string; snippet?: string }> | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function loadThreads() {
      const { data } = await supabase
        .from('threads')
        .select('*')
        .is('scheduled_task_id', null)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (data) setThreads(data);
    }

    loadThreads();

    const channel = supabase
      .channel('threads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'threads' }, () => loadThreads())
      .subscribe();

    const interval = setInterval(loadThreads, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      const results = await searchThreadsAction(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">C</div>
          <span className="font-semibold text-sm">Cooper</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => router.push('/chat')}
        >
          <PlusIcon className="size-4" />
          New chat
        </Button>
        <p className="text-[10px] text-muted-foreground text-center mt-1">
          ⌘K to search • ⌘N for new chat
        </p>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2 pb-2">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-7 pr-7 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
            <ScrollArea className="max-h-[calc(100vh-380px)]">
              <SidebarMenu>
                {searchResults !== null ? (
                  // Search results
                  <>
                    {searchResults.length === 0 && (
                      <p className="px-2 py-1 text-xs text-muted-foreground">No results</p>
                    )}
                    {searchResults.map((result) => (
                      <SidebarMenuItem key={result.id}>
                        <SidebarMenuButton
                          isActive={params?.threadId === result.id}
                          onClick={() => { router.push(`/chat/${result.id}`); setSearchQuery(''); }}
                        >
                          <MessageSquareIcon />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{result.title}</span>
                            {result.snippet && (
                              <span className="truncate text-[10px] text-muted-foreground">{result.snippet}</span>
                            )}
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </>
                ) : (
                  // Normal thread list
                  <>
                    {threads.length === 0 && (
                      <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet</p>
                    )}
                    {threads.map((thread) => (
                      <SidebarMenuItem key={thread.id}>
                        <SidebarMenuButton
                          isActive={params?.threadId === thread.id}
                          onClick={() => router.push(`/chat/${thread.id}`)}
                        >
                          <MessageSquareIcon />
                          <span className="truncate">{thread.title || 'Untitled'}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </>
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push('/connections')}>
              <PlugIcon />
              <span>Connections</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push('/knowledge')}>
              <BrainIcon />
              <span>Knowledge</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push('/skills')}>
              <ZapIcon />
              <span>Skills</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push('/schedules')}>
              <CalendarClockIcon />
              <span>Schedules</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push('/usage')}>
              <BarChart3Icon />
              <span>Usage</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => router.push('/activity')}>
              <ActivityIcon />
              <span>Activity</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                fetch('/auth/signout', { method: 'POST' }).then(() => {
                  window.location.href = '/auth/login';
                });
              }}
            >
              <LogOutIcon />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <CommandPalette />
      <AppSidebar />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
