'use client';

import { useEffect, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';
import type { ChatMessage, SuggestionData, StatusData } from '@/lib/chat-types';
import { suggestionsPartSchema, statusPartSchema } from '@/lib/chat-types';
import { messageToChatMessage } from '@/lib/chat-persistence';

export default function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const [initialMessages, setInitialMessages] = useState<ChatMessage[] | null>(null);

  useEffect(() => {
    async function loadMessages() {
      const supabase = createClient();
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (data) {
        setInitialMessages(data.map((message: Message) => messageToChatMessage(message)));
      } else {
        setInitialMessages([]);
      }
    }

    loadMessages();
  }, [threadId]);

  if (initialMessages === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <ChatThread
      key={threadId}
      threadId={threadId}
      initialMessages={initialMessages}
    />
  );
}

function ChatThread({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: ChatMessage[];
}) {
  const [modelOverride, setModelOverride] = useState('auto');
  const [suggestions, setSuggestions] = useState<SuggestionData[]>([]);
  const [streamStatus, setStreamStatus] = useState<StatusData | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: {
      threadId,
      ...(modelOverride !== 'auto' ? { modelOverride } : {}),
    },
  }), [modelOverride, threadId]);

  const { messages, sendMessage, stop, status, error, clearError, addToolApprovalResponse } = useChat<ChatMessage>({
    dataPartSchemas: { suggestions: suggestionsPartSchema, status: statusPartSchema },
    transport,
    messages: initialMessages,
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

  return (
    <div className="flex h-screen flex-col">
      <ChatMessages messages={messages} suggestions={suggestions} liveStatus={streamStatus} isStreaming={isStreaming} status={status} addToolApprovalResponse={addToolApprovalResponse} onSuggestionClick={(prompt) => sendMessage(
        { text: prompt },
        modelOverride !== 'auto'
          ? { body: { threadId, modelOverride } }
          : { body: { threadId } }
      )} />
      {error && (
        <div className="mx-auto max-w-3xl w-full px-4 pb-2">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
            <span>Something went wrong: {error.message}</span>
            <button onClick={clearError} className="text-xs underline ml-4 shrink-0">Dismiss</button>
          </div>
        </div>
      )}
      <ChatInput
        onSend={({ text, files, modelOverride }) => {
          setSuggestions([]);
          setStreamStatus(null);
          setModelOverride(modelOverride || 'auto');
          return sendMessage(
            { text, files },
            modelOverride && modelOverride !== 'auto'
              ? { body: { threadId, modelOverride } }
              : { body: { threadId } }
          );
        }}
        onStop={stop}
        disabled={isStreaming}
        isStreaming={isStreaming}
      />
    </div>
  );
}
