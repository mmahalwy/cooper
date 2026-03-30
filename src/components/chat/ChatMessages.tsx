'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble, StreamingIndicator } from './MessageBubble';

interface ChatMessagesProps {
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>;
  }>;
  isStreaming?: boolean;
}

export function ChatMessages({ messages, isStreaming }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            role={message.role}
            parts={message.parts}
          />
        ))}
        {isStreaming && <StreamingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
