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
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtContent,
} from '@/components/ai-elements/chain-of-thought';
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from '@/components/ai-elements/sources';
import { BotIcon, UserIcon } from 'lucide-react';
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation';
import { Shimmer } from '@/components/ai-elements/shimmer';

function formatToolName(raw: string): string {
  // Map internal tool names to friendly labels
  const map: Record<string, string> = {
    'COMPOSIO_SEARCH_TOOLS': 'Searching for tools',
    'COMPOSIO_MULTI_EXECUTE_TOOL': 'Running action',
    'COMPOSIO_GET_TOOL_SCHEMAS': 'Getting tool details',
    'COMPOSIO_MANAGE_CONNECTIONS': 'Managing connections',
    'COMPOSIO_REMOTE_BASH_TOOL': 'Running command',
    'COMPOSIO_REMOTE_WORKBENCH': 'Using workbench',
    'save_knowledge': 'Saving to memory',
    'load_skill': 'Loading skill',
    'create_schedule': 'Creating schedule',
    'list_schedules': 'Listing schedules',
    'update_schedule': 'Updating schedule',
    'delete_schedule': 'Deleting schedule',
  };
  if (map[raw]) return map[raw];
  // Clean up tool names: METABASE_POST_API_DATASET → "Metabase: Post API Dataset"
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractActionDetails(input: any): { description: string; details: Array<{ label: string; value: string }> } {
  if (!input) return { description: 'Cooper wants to perform an action', details: [] };

  // COMPOSIO_MULTI_EXECUTE_TOOL has tools[].tool_slug and tools[].arguments
  const tools = input?.tools || [];
  if (tools.length > 0) {
    const firstTool = tools[0];
    const slug = firstTool?.tool_slug || '';
    const args = firstTool?.arguments || {};

    // Make slug human-readable: SLACK_SEND_MESSAGE → "Send message on Slack"
    const parts = slug.split('_');
    const service = parts[0] || '';
    const action = parts.slice(1).join(' ').toLowerCase();
    const description = `Cooper wants to ${action || 'perform an action'} on ${service.charAt(0) + service.slice(1).toLowerCase()}`;

    // Extract key arguments as details
    const details: Array<{ label: string; value: string }> = [];
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' && value.length < 200) {
        details.push({ label: key.replace(/_/g, ' '), value: value as string });
      }
    }

    return { description, details };
  }

  return { description: 'Cooper wants to perform an action', details: [] };
}

interface ChatMessagesProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  status?: string;
  addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void;
}

export function ChatMessages({ messages, isStreaming, status, addToolApprovalResponse }: ChatMessagesProps) {
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
                {(() => {
                  const hasToolParts = message.role === 'assistant' && message.parts.some(
                    (p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool'
                  );
                  // Find the last text part (the final response)
                  const lastTextIdx = message.parts.reduce((acc, p, idx) => p.type === 'text' && p.text ? idx : acc, -1);

                  return message.parts.map((part, i) => {
                  if (part.type === 'text') {
                    if (!part.text) return null;
                    if (message.role === 'user') {
                      return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
                    }
                    // If this message has tool parts and this is NOT the final text, render as a chain-of-thought step
                    if (hasToolParts && i !== lastTextIdx) {
                      return (
                        <ChainOfThoughtStep key={i} label={part.text} status="complete" />
                      );
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
                        <ReasoningContent>{part.text}</ReasoningContent>
                      </Reasoning>
                    );
                  }

                  if (part.type === 'source-url') {
                    return (
                      <Sources key={i}>
                        <SourcesTrigger count={1} />
                        <SourcesContent>
                          <Source
                            title={(part as any).title || 'Source'}
                            href={(part as any).url || '#'}
                          />
                        </SourcesContent>
                      </Sources>
                    );
                  }

                  // Tool parts rendered as chain-of-thought steps
                  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                    const toolPart = part as any;
                    const rawName = toolPart.type === 'dynamic-tool'
                      ? toolPart.toolName
                      : toolPart.type.replace('tool-', '');
                    const friendlyName = formatToolName(rawName);
                    const isDone = toolPart.state === 'output-available' || toolPart.state === 'approval-responded';
                    const isRunning = toolPart.state === 'input-streaming' || toolPart.state === 'input-available';

                    return (
                      <ChainOfThoughtStep
                        key={i}
                        label={friendlyName}
                        status={isDone ? 'complete' : isRunning ? 'active' : 'pending'}
                      >
                        {isDone && (
                          <ChainOfThoughtSearchResults>
                            <ChainOfThoughtSearchResult>Result</ChainOfThoughtSearchResult>
                          </ChainOfThoughtSearchResults>
                        )}
                      </ChainOfThoughtStep>
                    );
                  }

                  return null;
                });
                })()}
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
