'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

export default function ChatPage() {
  const router = useRouter();
  const threadIdRef = useRef<string | null>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: async (url, options) => {
        const response = await fetch(url, options);
        const tid = response.headers.get('X-Thread-Id');
        if (tid && !threadIdRef.current) {
          threadIdRef.current = tid;
        }
        return response;
      },
    }),
    onFinish: () => {
      if (threadIdRef.current) {
        router.replace(`/chat/${threadIdRef.current}`);
      }
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen flex-col">
      {hasMessages ? (
        <ChatMessages messages={messages} isStreaming={isStreaming} status={status} />
      ) : (
        <EmptyState />
      )}
      <ChatInput
        onSend={(text) => sendMessage({ text })}
        disabled={isStreaming}
      />
    </div>
  );
}
