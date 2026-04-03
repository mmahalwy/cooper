'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';

export default function ChatPage() {
  const router = useRouter();
  const threadIdRef = useRef<string | null>(null);

  const { messages, sendMessage, stop, status, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: async (url, options) => {
        const response = await fetch(url, options);
        const tid = response.headers.get('X-Thread-Id');
        console.log('[chat] X-Thread-Id from response:', tid);
        if (tid && !threadIdRef.current) {
          threadIdRef.current = tid;
          router.replace(`/chat/${tid}`);
        }
        return response;
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isStreaming = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen flex-col">
      {hasMessages ? (
        <ChatMessages messages={messages} isStreaming={isStreaming} status={status} addToolApprovalResponse={addToolApprovalResponse} />
      ) : (
        <EmptyState onSuggestionClick={(prompt) => sendMessage({ text: prompt })} />
      )}
      <ChatInput
        onSend={({ text, files }) => sendMessage({ text, files })}
        onStop={stop}
        disabled={isStreaming}
        isStreaming={isStreaming}
      />
    </div>
  );
}
