'use client';

import { AppShell } from '@mantine/core';
import { ChatSidebar } from '@/components/chat/ChatSidebar';

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      navbar={{ width: 280, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="md">
        <ChatSidebar />
      </AppShell.Navbar>
      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
