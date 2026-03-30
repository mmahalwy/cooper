'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WrenchIcon, BotIcon, UserIcon, LightbulbIcon, GlobeIcon, ChevronDownIcon, LoaderIcon } from 'lucide-react';
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

type MessagePart = TextPart | ToolPart | { type: string; [key: string]: unknown };

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
        {isUser ? <UserIcon className="size-4" /> : <BotIcon className="size-4" />}
      </div>
      <div className={cn('max-w-[80%]', isUser ? 'bg-muted rounded-lg px-4 py-2.5' : '')}>
        <div className="text-sm">
          {parts.map((part, i) => {
            if (part.type === 'text') {
              const textPart = part as TextPart;
              if (!textPart.text) return null;
              return isUser ? (
                <p key={i} className="whitespace-pre-wrap">{textPart.text}</p>
              ) : (
                <div key={i} className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-code:before:content-none prose-code:after:content-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {textPart.text}
                  </ReactMarkdown>
                </div>
              );
            }

            if (part.type === 'reasoning') {
              const text = (part as any).text || (part as any).reasoning;
              if (!text) return null;
              return <ReasoningDisplay key={i} text={text} />;
            }

            if (part.type === 'source' || part.type === 'sources') {
              const sources = (part as any).sources || [(part as any)];
              return <SourcesDisplay key={i} sources={sources} />;
            }

            if (isToolPart(part)) {
              return (
                <ToolCallDisplay
                  key={i}
                  toolName={extractToolName(part as ToolPart)}
                  state={(part as ToolPart).state}
                  input={(part as ToolPart).input}
                  output={(part as ToolPart).output}
                  errorText={(part as ToolPart).errorText}
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
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BotIcon className="size-4" />
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Cooper is thinking...</span>
      </div>
    </div>
  );
}

function ReasoningDisplay({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-2 rounded-md border bg-muted/50 px-3 py-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between cursor-pointer">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <LightbulbIcon className="size-3.5" />
          <span className="text-xs font-medium">Reasoning</span>
        </div>
        <ChevronDownIcon className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{text}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SourcesDisplay({ sources }: { sources: any[] }) {
  return (
    <div className="my-2 flex flex-wrap gap-1.5">
      {sources.map((s: any, j: number) => (
        <a
          key={j}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
        >
          <GlobeIcon className="size-3" />
          {s.title || new URL(s.url).hostname}
        </a>
      ))}
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
  const isRunning = !isDone && !isError;

  const badgeVariant = isDone ? 'default' : isError ? 'destructive' : 'secondary';
  const stateLabel = isDone
    ? 'Done'
    : isError
      ? 'Error'
      : state === 'approval-requested'
        ? 'Awaiting approval'
        : 'Running...';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-2 rounded-md border bg-muted/30 px-3 py-2">
      <CollapsibleTrigger className="flex w-full items-center justify-between cursor-pointer">
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <WrenchIcon className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">{toolName}</span>
          <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
            {stateLabel}
          </Badge>
        </div>
        <ChevronDownIcon className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
          {JSON.stringify({ input, output: output ?? errorText }, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
