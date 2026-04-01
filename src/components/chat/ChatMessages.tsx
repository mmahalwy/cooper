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
  ChainOfThoughtContent,
} from '@/components/ai-elements/chain-of-thought';
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from '@/components/ai-elements/sources';
import { useState } from 'react';
import { BotIcon, UserIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { CopyMessageButton } from './CopyMessageButton';

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

function ToolResultView({ output }: { output: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const formatted = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  const isLong = formatted.length > 200;

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        <ChevronRightIcon className={cn('size-3 transition-transform', expanded && 'rotate-90')} />
        {expanded ? 'Hide result' : 'View result'}
      </button>
      {expanded && (
        <pre className="mt-1.5 max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
          {formatted}
        </pre>
      )}
    </div>
  );
}

function AssistantParts({ parts, role, isStreaming, isLastMessage, addToolApprovalResponse }: { parts: any[]; role: string; isStreaming?: boolean; isLastMessage: boolean; addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void }) {
  if (role === 'user') {
    return parts.map((part, i) => {
      if (part.type === 'text' && part.text) {
        return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
      }
      return null;
    });
  }

  // Check if message has tool calls
  const toolParts = parts.filter((p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool');
  const hasTools = toolParts.length > 0;

  // Find the last text part (the final answer)
  const lastTextIdx = parts.reduce((acc: number, p: any, idx: number) => (p.type === 'text' && p.text) ? idx : acc, -1);

  // Build a summary for the chain-of-thought header
  const toolSummary = toolParts.map((p: any) => {
    const raw = p.type === 'dynamic-tool' ? p.toolName : p.type.replace('tool-', '');
    return formatToolName(raw);
  });
  const headerText = toolSummary.length > 0
    ? `Used ${toolSummary.length} tool${toolSummary.length > 1 ? 's' : ''}`
    : 'Working...';

  const elements: React.ReactNode[] = [];

  // If tools present, wrap tool steps + intermediate text in ChainOfThought
  if (hasTools) {
    const steps: React.ReactNode[] = [];

    parts.forEach((part, i) => {
      if (i === lastTextIdx) return; // skip final response — rendered outside

      if (part.type === 'text' && part.text) {
        // Intermediate thinking text
        steps.push(
          <ChainOfThoughtStep key={`t-${i}`} label={part.text} status="complete" />
        );
      }

      if (part.type === 'reasoning' && part.text) {
        steps.push(
          <ChainOfThoughtStep key={`r-${i}`} label={`Thinking: ${part.text.slice(0, 80)}...`} status="complete" />
        );
      }

      if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
        const toolPart = part as any;
        const raw = toolPart.type === 'dynamic-tool' ? toolPart.toolName : toolPart.type.replace('tool-', '');
        const friendly = formatToolName(raw);
        const isDone = toolPart.state === 'output-available' || toolPart.state === 'approval-responded';
        const isRunning = toolPart.state === 'input-streaming' || toolPart.state === 'input-available';
        const needsApproval = toolPart.approval && (toolPart.state === 'approval-requested' || toolPart.state === 'approval-responded' || toolPart.state === 'output-denied');

        steps.push(
          <ChainOfThoughtStep
            key={`s-${i}`}
            label={friendly}
            status={isDone ? 'complete' : isRunning ? 'active' : 'pending'}
          >
            {isDone && toolPart.output != null && (
              <ToolResultView output={toolPart.output} />
            )}
            {needsApproval && (
              <Confirmation approval={toolPart.approval} state={toolPart.state} className="mt-2">
                <ConfirmationTitle>{extractActionDetails(toolPart.input).description}</ConfirmationTitle>
                <ConfirmationRequest>
                  {extractActionDetails(toolPart.input).details.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {extractActionDetails(toolPart.input).details.map((d, j) => (
                        <div key={j}><span className="font-medium capitalize">{d.label}:</span> {d.value}</div>
                      ))}
                    </div>
                  )}
                </ConfirmationRequest>
                <ConfirmationAccepted>
                  <p className="text-xs text-green-600">Approved</p>
                </ConfirmationAccepted>
                <ConfirmationRejected>
                  <p className="text-xs text-red-600">Denied</p>
                </ConfirmationRejected>
                {addToolApprovalResponse && (
                  <ConfirmationActions>
                    <ConfirmationAction
                      variant="outline"
                      onClick={() => addToolApprovalResponse({ id: toolPart.approval.id, approved: false })}
                    >
                      Deny
                    </ConfirmationAction>
                    <ConfirmationAction
                      onClick={() => addToolApprovalResponse({ id: toolPart.approval.id, approved: true })}
                    >
                      Approve
                    </ConfirmationAction>
                  </ConfirmationActions>
                )}
              </Confirmation>
            )}
          </ChainOfThoughtStep>
        );
      }
    });

    elements.push(
      <ChainOfThought key="cot" defaultOpen={isStreaming && isLastMessage}>
        <ChainOfThoughtHeader>{headerText}</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {steps}
        </ChainOfThoughtContent>
      </ChainOfThought>
    );

  }

  // Render parts that aren't tool-related
  parts.forEach((part, i) => {
    if (hasTools && i !== lastTextIdx) return; // already handled in chain-of-thought

    if (part.type === 'text' && part.text) {
      elements.push(
        <MessageResponse
          key={`msg-${i}`}
          isAnimating={isStreaming && isLastMessage && i === parts.length - 1}
        >
          {part.text}
        </MessageResponse>
      );
    }

    if (part.type === 'reasoning' && !hasTools) {
      elements.push(
        <Reasoning key={`reas-${i}`} isStreaming={isStreaming && isLastMessage && i === parts.length - 1}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    }

    if (part.type === 'source-url') {
      elements.push(
        <Sources key={`src-${i}`}>
          <SourcesTrigger count={1} />
          <SourcesContent>
            <Source title={(part as any).title || 'Source'} href={(part as any).url || '#'} />
          </SourcesContent>
        </Sources>
      );
    }
  });

  return <>{elements}</>;
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
      <ConversationContent className="mx-auto max-w-3xl px-3 md:px-6">
        {messages.map((message) => {
          const textContent = message.parts
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && 'text' in p)
            .map((p) => p.text || '')
            .join('\n')
            .trim();

          return (
            <Message key={message.id} from={message.role}>
              <div className="group/msg relative flex items-start gap-3">
                {message.role !== 'user' && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <BotIcon className="size-4" />
                  </div>
                )}
                <MessageContent>
                  <AssistantParts parts={message.parts} role={message.role} isStreaming={isStreaming} isLastMessage={message.id === messages[messages.length - 1]?.id} addToolApprovalResponse={addToolApprovalResponse} />
                </MessageContent>
                {message.role === 'user' && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <UserIcon className="size-4" />
                  </div>
                )}
                {textContent && (
                  <div className="absolute -bottom-3 right-0 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                    <CopyMessageButton content={textContent} />
                  </div>
                )}
              </div>
            </Message>
          );
        })}

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
