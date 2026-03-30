'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WrenchIcon } from 'lucide-react';
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
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        )}
      >
        {parts.map((part, i) => {
          if (part.type === 'text') {
            const textPart = part as TextPart;
            if (!textPart.text) return null;
            return (
              <p key={i} className="text-sm whitespace-pre-wrap">
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
    <Collapsible open={open} onOpenChange={setOpen} className="my-1">
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
