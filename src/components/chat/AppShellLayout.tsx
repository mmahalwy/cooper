'use client';

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
  LogOutIcon,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Thread } from '@/lib/types';

function AppSidebar() {
  const router = useRouter();
  const params = useParams();
  const [threads, setThreads] = useState<Thread[]>([]);

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
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <ScrollArea className="max-h-[calc(100vh-320px)]">
              <SidebarMenu>
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
      <AppSidebar />
      <SidebarInset>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
