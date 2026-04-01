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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  SettingsIcon,
  MoreHorizontalIcon,
  PenIcon,
  TrashIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import { searchThreadsAction } from '@/app/actions';
import { Input } from '@/components/ui/input';
import { useRouter, useParams } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { renameThreadAction, deleteThreadAction, togglePinThreadAction } from '@/app/actions';
import type { Thread } from '@/lib/types';

function AppSidebar() {
  const router = useRouter();
  const params = useParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string; snippet?: string }> | null>(null);
  const [searching, setSearching] = useState(false);

  const loadThreads = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('threads')
      .select('*')
      .is('scheduled_task_id', null)
      .order('pinned', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(50);
    if (data) setThreads(data);
  }, []);

  useEffect(() => {
    const supabase = createClient();

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
  }, [loadThreads]);

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
                  <SidebarMenuItem key={thread.id} className="group relative">
                    <SidebarMenuButton
                      isActive={params?.threadId === thread.id}
                      onClick={() => router.push(`/chat/${thread.id}`)}
                    >
                      {thread.pinned ? <PinIcon className="size-3.5" /> : <MessageSquareIcon />}
                      <span className="truncate">{thread.title || 'Untitled'}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted">
                          <MoreHorizontalIcon className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={async () => {
                          const title = prompt('Rename thread:', thread.title || '');
                          if (title) {
                            await renameThreadAction(thread.id, title);
                            loadThreads();
                          }
                        }}>
                          <PenIcon className="size-3.5 mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          await togglePinThreadAction(thread.id, !thread.pinned);
                          loadThreads();
                        }}>
                          {thread.pinned ? (
                            <><PinOffIcon className="size-3.5 mr-2" /> Unpin</>
                          ) : (
                            <><PinIcon className="size-3.5 mr-2" /> Pin to top</>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={async () => {
                            if (confirm('Delete this conversation?')) {
                              await deleteThreadAction(thread.id);
                              loadThreads();
                              if (params?.threadId === thread.id) router.push('/chat');
                            }
                          }}
                        >
                          <TrashIcon className="size-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            <SidebarMenuButton onClick={() => router.push('/settings')}>
              <SettingsIcon />
              <span>Settings</span>
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
