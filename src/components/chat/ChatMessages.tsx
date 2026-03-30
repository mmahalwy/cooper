'use client';

import type { UIMessage } from 'ai';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ai-elements/reasoning';
import {
  Tool,
  ToolHeader,
  ToolContent,
} from '@/components/ai-elements/tool';
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from '@/components/ai-elements/sources';
import { BotIcon, UserIcon } from 'lucide-react';
import { Shimmer } from '@/components/ai-elements/shimmer';

interface ChatMessagesProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  status?: string;
}

export function ChatMessages({ messages, isStreaming, status }: ChatMessagesProps) {
  return (
    <Conversation className="flex-1">
      <ConversationContent className="mx-auto max-w-3xl">
        {messages.map((message) => (
          <Message key={message.id} from={message.role}>
            <div className="flex items-start gap-3">
              {message.role !== 'user' && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <BotIcon className="size-4" />
                </div>
              )}
              <MessageContent>
                {message.parts.map((part, i) => {
                  if (part.type === 'text') {
                    if (!part.text) return null;
                    if (message.role === 'user') {
                      return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
                    }
                    return (
                      <MessageResponse
                        key={i}
                        isAnimating={isStreaming && i === message.parts.length - 1}
                      >
                        {part.text}
                      </MessageResponse>
                    );
                  }

                  if (part.type === 'reasoning') {
                    return (
                      <Reasoning
                        key={i}
                        isStreaming={isStreaming && i === message.parts.length - 1}
                      >
                        <ReasoningTrigger />
                        <ReasoningContent>{part.reasoning}</ReasoningContent>
                      </Reasoning>
                    );
                  }

                  if (part.type === 'source') {
                    return (
                      <Sources key={i}>
                        <SourcesTrigger count={part.source?.sourceType ? 1 : 0} />
                        <SourcesContent>
                          <Source
                            title={part.source?.title || 'Source'}
                            href={part.source?.url || '#'}
                          />
                        </SourcesContent>
                      </Sources>
                    );
                  }

                  // Tool parts: type is 'tool-{name}' or 'dynamic-tool'
                  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                    const toolPart = part as any;
                    return (
                      <Tool key={i}>
                        <ToolHeader
                          type={toolPart.type}
                          state={toolPart.state}
                          {...(toolPart.type === 'dynamic-tool' ? { toolName: toolPart.toolName } : {})}
                        />
                        {(toolPart.state === 'output-available' || toolPart.state === 'output-error') && (
                          <ToolContent>
                            <pre className="text-xs overflow-auto">
                              {JSON.stringify(toolPart.output ?? toolPart.errorText, null, 2)}
                            </pre>
                          </ToolContent>
                        )}
                      </Tool>
                    );
                  }

                  return null;
                })}
              </MessageContent>
              {message.role === 'user' && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <UserIcon className="size-4" />
                </div>
              )}
            </div>
          </Message>
        ))}

        {status === 'submitted' && (
          <Message from="assistant">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BotIcon className="size-4" />
              </div>
              <MessageContent>
                <Shimmer>Cooper is thinking...</Shimmer>
              </MessageContent>
            </div>
          </Message>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
