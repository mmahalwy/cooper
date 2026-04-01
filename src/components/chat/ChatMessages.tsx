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
import { useState, useMemo, useRef, useEffect } from 'react';
import { BotIcon, UserIcon, ChevronRightIcon, ClockIcon, CheckCircle2Icon, XCircleIcon, CircleDotIcon, CircleDashedIcon, TargetIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StreamingStatus } from './StreamingStatus';
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation';
import { CopyMessageButton } from './CopyMessageButton';
import { ArtifactRenderer } from './ArtifactRenderer';
import { isArtifactResult } from '@/modules/agent/artifacts';

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
    'create_artifact': 'Creating artifact',
    'create_schedule': 'Creating schedule',
    'list_schedules': 'Listing schedules',
    'update_schedule': 'Updating schedule',
    'delete_schedule': 'Deleting schedule',
    'plan_task': 'Planning approach',
    'update_plan_step': 'Updating progress',
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

/**
 * Format milliseconds into a human-friendly duration string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Hook to track tool execution timing.
 * Records when each tool part first appears as running and when it completes,
 * then returns the elapsed duration per tool index.
 */
function useToolTiming(parts: any[]): Map<number, number> {
  const startTimesRef = useRef<Map<number, number>>(new Map());
  const durationsRef = useRef<Map<number, number>>(new Map());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    let changed = false;

    parts.forEach((part, i) => {
      if (!part.type?.startsWith('tool-') && part.type !== 'dynamic-tool') return;

      const state = (part as any).state;
      const isRunning = state === 'input-streaming' || state === 'input-available';
      const isDone = state === 'output-available' || state === 'approval-responded' ||
                     state === 'output-error' || state === 'output-denied';

      if (isRunning && !startTimesRef.current.has(i)) {
        startTimesRef.current.set(i, Date.now());
        changed = true;
      }

      if (isDone && startTimesRef.current.has(i) && !durationsRef.current.has(i)) {
        const start = startTimesRef.current.get(i)!;
        durationsRef.current.set(i, Date.now() - start);
        changed = true;
      }
    });

    if (changed) forceUpdate((n) => n + 1);
  }, [parts]);

  return durationsRef.current;
}

/**
 * Extract the currently active tool's friendly name from message parts.
 * Returns undefined if no tool is actively running.
 */
function getActiveToolName(parts: any[]): string | undefined {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (!part.type?.startsWith('tool-') && part.type !== 'dynamic-tool') continue;

    const state = (part as any).state;
    if (state === 'input-streaming' || state === 'input-available') {
      const raw = part.type === 'dynamic-tool' ? part.toolName : part.type.replace('tool-', '');
      return formatToolName(raw) + '...';
    }
  }
  return undefined;
}

const planStepStatusIcon: Record<string, React.ReactNode> = {
  pending: <CircleDashedIcon className="size-3.5 text-muted-foreground/50" />,
  active: <CircleDotIcon className="size-3.5 text-blue-500 animate-pulse" />,
  complete: <CheckCircle2Icon className="size-3.5 text-green-500" />,
  failed: <XCircleIcon className="size-3.5 text-red-500" />,
  skipped: <CircleDashedIcon className="size-3.5 text-muted-foreground line-through" />,
};

function PlanView({ input, output, stepUpdates }: { input: any; output: any; stepUpdates: Map<string, { status: string; note?: string }> }) {
  if (!input?.goal || !input?.steps) return null;

  const steps = (output?.steps || input.steps) as Array<{
    id: string;
    action: string;
    tool?: string;
    dependsOn?: string[];
    status?: string;
  }>;

  // Merge live step updates from update_plan_step calls
  const mergedSteps = steps.map((step) => {
    const update = stepUpdates.get(step.id);
    return { ...step, status: update?.status || step.status || 'pending', note: update?.note };
  });

  const completedCount = mergedSteps.filter((s) => s.status === 'complete').length;
  const totalCount = mergedSteps.length;

  return (
    <div className="mt-2 rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-start gap-2">
        <TargetIcon className="size-4 mt-0.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{input.goal}</p>
          <div className="flex items-center gap-2 mt-1">
            {input.estimatedTime && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ClockIcon className="size-3" />
                {input.estimatedTime}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {completedCount}/{totalCount} steps
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 ml-1">
        {mergedSteps.map((step, idx) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-2 text-sm transition-opacity',
              step.status === 'pending' && 'opacity-50',
              step.status === 'skipped' && 'opacity-40 line-through',
            )}
          >
            <span className="mt-0.5 shrink-0">{planStepStatusIcon[step.status] || planStepStatusIcon.pending}</span>
            <div className="flex-1 min-w-0">
              <span>{step.action}</span>
              {step.tool && <span className="ml-1.5 text-xs text-muted-foreground">({step.tool})</span>}
              {step.note && <p className="text-xs text-muted-foreground mt-0.5">{step.note}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantParts({ parts, role, isStreaming, isLastMessage, addToolApprovalResponse }: { parts: any[]; role: string; isStreaming?: boolean; isLastMessage: boolean; addToolApprovalResponse?: (response: { id: string; approved: boolean }) => void }) {
  const toolTimings = useToolTiming(parts);

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

  // Collect plan step updates from update_plan_step calls
  const stepUpdates = useMemo(() => {
    const updates = new Map<string, { status: string; note?: string }>();
    for (const p of parts) {
      const raw = p.type === 'dynamic-tool' ? p.toolName : p.type?.replace('tool-', '');
      if (raw === 'update_plan_step' && p.input) {
        updates.set(p.input.stepId, { status: p.input.status, note: p.input.note });
      }
    }
    return updates;
  }, [parts]);

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

        // If this is a completed create_artifact call, render inline artifact
        // instead of the usual chain-of-thought step
        if (raw === 'create_artifact' && isDone && isArtifactResult(toolPart.output)) {
          steps.push(
            <div key={`artifact-${i}`} className="py-1">
              <ArtifactRenderer data={toolPart.output} />
            </div>
          );
          return; // skip normal step rendering for this part
        }

        const isPlanTask = raw === 'plan_task';
        const isUpdateStep = raw === 'update_plan_step';

        // Build label with timing info when available
        const duration = toolTimings.get(i);
        const labelWithTiming = duration != null ? (
          <span>
            {friendly}
            <span className="ml-1.5 text-xs text-muted-foreground/70">
              ({formatDuration(duration)})
            </span>
          </span>
        ) : friendly;

        steps.push(
          <ChainOfThoughtStep
            key={`s-${i}`}
            label={labelWithTiming}
            status={isDone ? 'complete' : isRunning ? 'active' : 'pending'}
          >
            {isPlanTask && isDone && (
              <PlanView input={toolPart.input} output={toolPart.output} stepUpdates={stepUpdates} />
            )}

            {!isPlanTask && !isUpdateStep && isDone && toolPart.output != null && (
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
  // Derive the active tool name from the last assistant message's parts
  const lastMessage = messages[messages.length - 1];
  const currentTool =
    isStreaming && lastMessage?.role === 'assistant'
      ? getActiveToolName(lastMessage.parts)
      : undefined;

  return (
    <Conversation className="flex-1">
      <ConversationContent className="mx-auto max-w-3xl">
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
                <StreamingStatus status={status} currentTool={currentTool} />
              </MessageContent>
            </div>
          </Message>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
