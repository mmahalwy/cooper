'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Stack } from '@mantine/core';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { useParams } from 'next/navigation';

export default function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { threadId },
    }),
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  return (
    <Stack h="100vh" gap={0} justify="space-between">
      <ChatMessages messages={messages} />
      <ChatInput
        onSend={(text) => sendMessage({ text })}
        disabled={isStreaming}
      />
    </Stack>
  );
}
