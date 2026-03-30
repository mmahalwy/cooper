'use client';

import { ChatSidebar } from '@/components/chat/ChatSidebar';

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="w-[280px] border-r p-4 flex-shrink-0">
        <ChatSidebar />
      </aside>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
