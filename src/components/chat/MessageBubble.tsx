'use client';

import { Paper, Text, Box, Code, Collapse, Group, Badge } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { useState } from 'react';

// UIToolInvocation states from AI SDK v6
type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied';

interface ToolPart {
  type: string; // 'tool-{name}' or 'dynamic-tool'
  toolName?: string; // present on DynamicToolUIPart
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
  // Static tool parts have type 'tool-{toolName}'
  if (part.type.startsWith('tool-')) return part.type.slice(5);
  return 'unknown';
}

export function MessageBubble({ role, parts }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <Paper
        p="sm"
        radius="lg"
        maw="70%"
        style={{
          backgroundColor: isUser ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-0)',
        }}
      >
        {parts.map((part, i) => {
          if (part.type === 'text') {
            const textPart = part as TextPart;
            if (!textPart.text) return null;
            return (
              <Text
                key={i}
                size="sm"
                c={isUser ? 'white' : undefined}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {textPart.text}
              </Text>
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
      </Paper>
    </Box>
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
  const [expanded, setExpanded] = useState(false);

  const isDone = state === 'output-available';
  const isError = state === 'output-error' || state === 'output-denied';
  const stateColor = isDone ? 'green' : isError ? 'red' : 'blue';
  const stateLabel = isDone
    ? 'Done'
    : isError
      ? errorText ?? 'Error'
      : state === 'approval-requested'
        ? 'Awaiting approval'
        : 'Running...';

  return (
    <Box my={4}>
      <Group
        gap="xs"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <IconTool size={14} />
        <Text size="xs" fw={500}>{toolName}</Text>
        <Badge size="xs" color={stateColor} variant="light">{stateLabel}</Badge>
      </Group>
      <Collapse in={expanded}>
        <Code block mt={4} style={{ fontSize: 11 }}>
          {JSON.stringify({ input, output: output ?? errorText }, null, 2)}
        </Code>
      </Collapse>
    </Box>
  );
}
