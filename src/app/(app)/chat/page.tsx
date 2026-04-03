'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useRef } from 'react';
import type { ChatMessage } from '@/lib/chat-types';
import { suggestionsPartSchema } from '@/lib/chat-types';

export default function ChatPage() {
  const threadIdRef = useRef<string | null>(null);

  const { messages, sendMessage, stop, status, addToolApprovalResponse } = useChat<ChatMessage>({
    dataPartSchemas: { suggestions: suggestionsPartSchema },
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: async (url, options) => {
        // Inject threadId into the request body for follow-up messages
        if (threadIdRef.current && options?.body) {
          try {
            const body = JSON.parse(options.body as string);
            body.threadId = threadIdRef.current;
            options = { ...options, body: JSON.stringify(body) };
          } catch { /* body isn't JSON, skip */ }
        }

        const response = await fetch(url, options);
        const tid = response.headers.get('X-Thread-Id');
        if (tid && !threadIdRef.current) {
          threadIdRef.current = tid;
          window.history.replaceState(null, '', `/chat/${tid}`);
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
        <ChatMessages messages={messages} isStreaming={isStreaming} status={status} addToolApprovalResponse={addToolApprovalResponse} onSuggestionClick={(prompt) => sendMessage({ text: prompt })} />
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
