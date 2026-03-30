'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea, Stack } from '@mantine/core';
import { MessageBubble } from './MessageBubble';

interface ChatMessagesProps {
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string }>;
  }>;
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  return (
    <ScrollArea h="calc(100vh - 180px)" viewportRef={viewportRef}>
      <Stack gap={0} p="md">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            role={message.role}
            parts={message.parts}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}
