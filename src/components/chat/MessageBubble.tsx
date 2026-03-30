'use client';

import { Paper, Text, Box } from '@mantine/core';

interface MessageBubbleProps {
  role: string;
  parts: Array<{ type: string; text?: string }>;
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
            return (
              <Text
                key={i}
                size="sm"
                c={isUser ? 'white' : undefined}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {part.text}
              </Text>
            );
          }
          return null;
        })}
      </Paper>
    </Box>
  );
}
