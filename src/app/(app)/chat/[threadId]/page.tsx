'use client';

import { useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Stack, Loader, Center } from '@mantine/core';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';

export default function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const [initialMessages, setInitialMessages] = useState<
    Array<{ id: string; role: 'user' | 'assistant' | 'system'; parts: Array<{ type: 'text'; text: string }> }> | null
  >(null);

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

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { threadId },
    }),
    messages: initialMessages || undefined,
  });

  if (initialMessages === null) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

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
