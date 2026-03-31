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

                  // Tool parts: type is 'tool-{name}' or 'dynamic-tool'
                  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
                    const toolPart = part as any;
                    const rawName = toolPart.type === 'dynamic-tool'
                      ? toolPart.toolName
                      : toolPart.type.replace('tool-', '');
                    const friendlyName = formatToolName(rawName);

                    // Show confirmation component for approval-requested tools
                    if (toolPart.state === 'approval-requested' && addToolApprovalResponse) {
                      const actionDetails = extractActionDetails(toolPart.input);

                      return (
                        <Confirmation key={i} state={toolPart.state} approval={toolPart.approval}>
                          <ConfirmationTitle>
                            {actionDetails.description}
                          </ConfirmationTitle>
                          <ConfirmationRequest>
                            {actionDetails.details.length > 0 && (
                              <div className="mt-2 rounded bg-muted p-3 text-xs space-y-1">
                                {actionDetails.details.map((d, j) => (
                                  <div key={j} className="flex gap-2">
                                    <span className="text-muted-foreground shrink-0">{d.label}:</span>
                                    <span className="font-medium">{d.value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <ConfirmationActions>
                              <ConfirmationAction
                                variant="outline"
                                onClick={() => addToolApprovalResponse({ id: toolPart.approval?.id || toolPart.toolCallId, approved: false })}
                              >
                                Deny
                              </ConfirmationAction>
                              <ConfirmationAction
                                onClick={() => addToolApprovalResponse({ id: toolPart.approval?.id || toolPart.toolCallId, approved: true })}
                              >
                                Approve
                              </ConfirmationAction>
                            </ConfirmationActions>
                          </ConfirmationRequest>
                          <ConfirmationAccepted>
                            <p className="text-sm text-muted-foreground">Approved — running...</p>
                          </ConfirmationAccepted>
                          <ConfirmationRejected>
                            <p className="text-sm text-muted-foreground">Denied — action cancelled.</p>
                          </ConfirmationRejected>
                        </Confirmation>
                      );
                    }

                    return (
                      <Tool key={i} defaultOpen={false}>
                        <ToolHeader
                          type={toolPart.type}
                          state={toolPart.state}
                          title={friendlyName}
                          {...(toolPart.type === 'dynamic-tool' ? { toolName: friendlyName } : {})}
                        />
                        {(toolPart.state === 'output-available' || toolPart.state === 'output-error') && (
                          <ToolContent>
                            <pre className="text-xs overflow-auto max-h-48">
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
