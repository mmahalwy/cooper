'use client';

import { useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';

type LoadedMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: Array<{ type: 'text'; text: string }>;
};

export default function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const [initialMessages, setInitialMessages] = useState<LoadedMessage[] | null>(null);

  useEffect(() => {
    async function loadMessages() {
      const supabase = createClient();
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (data) {
        setInitialMessages(
          data.map((m: Message) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'system',
            parts: [{ type: 'text' as const, text: m.content }],
          }))
        );
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
  initialMessages: LoadedMessage[];
}) {
  const { messages, sendMessage, stop, status, addToolApprovalResponse } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { threadId },
    }),
    messages: initialMessages,
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex h-screen flex-col">
      <ChatMessages messages={messages} isStreaming={isStreaming} status={status} addToolApprovalResponse={addToolApprovalResponse} />
      <ChatInput
        onSend={(text) => sendMessage({ text })}
        onStop={stop}
        disabled={isStreaming}
        isStreaming={isStreaming}
      />
    </div>
  );
}
