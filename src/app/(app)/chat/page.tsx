'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useMemo, useState } from 'react';
import type { ChatMessage, SuggestionData, StatusData } from '@/lib/chat-types';
import { suggestionsPartSchema, statusPartSchema } from '@/lib/chat-types';

export default function ChatPage() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [modelOverride, setModelOverride] = useState<string>('auto');
  const [suggestions, setSuggestions] = useState<SuggestionData[]>([]);
  const [streamStatus, setStreamStatus] = useState<StatusData | null>(null);

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    fetch: async (url, options) => {
      if (threadId && options?.body) {
        try {
          const body = JSON.parse(options.body as string);
          body.threadId = threadId;
          if (modelOverride && modelOverride !== 'auto') {
            body.modelOverride = modelOverride;
          }
          options = { ...options, body: JSON.stringify(body) };
        } catch { /* body isn't JSON, skip */ }
      }

      const response = await fetch(url, options);
      const tid = response.headers.get('X-Thread-Id');
      if (tid && !threadId) {
        setThreadId(tid);
        window.history.replaceState(null, '', `/chat/${tid}`);
      }
      return response;
    },
  }), [modelOverride, threadId]);

  const { messages, sendMessage, stop, status, addToolApprovalResponse } = useChat<ChatMessage>({
    dataPartSchemas: { suggestions: suggestionsPartSchema, status: statusPartSchema },
    transport,
    onData: (part) => {
      if (part.type === 'data-suggestions') {
        setSuggestions(part.data);
      }
      if (part.type === 'data-status') {
        setStreamStatus(part.data);
      }
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isStreaming = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen flex-col">
      {hasMessages ? (
        <ChatMessages messages={messages} suggestions={suggestions} liveStatus={streamStatus} isStreaming={isStreaming} status={status} addToolApprovalResponse={addToolApprovalResponse} onSuggestionClick={(prompt) => sendMessage({ text: prompt })} />
      ) : (
        <EmptyState onSuggestionClick={(prompt) => sendMessage({ text: prompt })} />
      )}
      <ChatInput
        onSend={({ text, files, modelOverride }) => {
          setSuggestions([]);
          setStreamStatus(null);
          setModelOverride(modelOverride || 'auto');
          return sendMessage(
            { text, files },
            modelOverride && modelOverride !== 'auto'
              ? { body: { modelOverride } }
              : undefined
          );
        }}
        onStop={stop}
        disabled={isStreaming}
        isStreaming={isStreaming}
      />
    </div>
  );
}
