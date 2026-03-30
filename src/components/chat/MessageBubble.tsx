'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WrenchIcon, BotIcon, UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

interface ToolPart {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

interface TextPart {
  type: 'text';
  text?: string;
}

type MessagePart = TextPart | ToolPart | { type: string };

interface MessageBubbleProps {
  role: string;
  parts: Array<MessagePart>;
}

function isToolPart(part: MessagePart): part is ToolPart {
  return (
    part.type === 'dynamic-tool' ||
    (part.type.startsWith('tool-') && part.type !== 'tool-invocation')
  );
}

function extractToolName(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return 'unknown';
}

export function MessageBubble({ role, parts }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3 py-4', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}>
        {isUser ? (
          <UserIcon className="size-4" />
        ) : (
          <BotIcon className="size-4" />
        )}
      </div>
      <div className={cn(
        'max-w-[75%] rounded-lg px-4 py-2.5',
        isUser ? 'bg-muted' : ''
      )}>
        <div className="text-sm">
          {parts.map((part, i) => {
            if (part.type === 'text') {
              const textPart = part as TextPart;
              if (!textPart.text) return null;
              return (
                <p key={i} className="whitespace-pre-wrap text-left">
                  {textPart.text}
                </p>
              );
            }

            if (isToolPart(part)) {
              const toolPart = part as ToolPart;
              return (
                <ToolCallDisplay
                  key={i}
                  toolName={extractToolName(toolPart)}
                  state={toolPart.state}
                  input={toolPart.input}
                  output={toolPart.output}
                  errorText={toolPart.errorText}
                />
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}

export function StreamingIndicator() {
  return (
    <div className="flex gap-3 py-4">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <BotIcon className="size-4" />
      </div>
      <div className="flex items-center gap-1 pt-2">
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
        <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function ToolCallDisplay({
  toolName,
  state,
  input,
  output,
  errorText,
}: {
  toolName: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}) {
  const [open, setOpen] = useState(false);

  const isDone = state === 'output-available';
  const isError = state === 'output-error' || state === 'output-denied';

  const badgeVariant = isDone ? 'default' : isError ? 'destructive' : 'secondary';
  const stateLabel = isDone
    ? 'Done'
    : isError
      ? errorText ?? 'Error'
      : state === 'approval-requested'
        ? 'Awaiting approval'
        : 'Running...';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-2 text-left">
      <CollapsibleTrigger className="flex items-center gap-1.5 cursor-pointer">
        <WrenchIcon className="size-3.5" />
        <span className="text-xs font-medium">{toolName}</span>
        <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
          {stateLabel}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 rounded bg-muted p-2 text-[11px] overflow-auto">
          {JSON.stringify({ input, output: output ?? errorText }, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
