'use client';

import { useState } from 'react';
import { Textarea, ActionIcon, Group, Box } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
      <Group gap="sm" align="flex-end">
        <Textarea
          placeholder="Message Cooper..."
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autosize
          minRows={1}
          maxRows={5}
          style={{ flex: 1 }}
          disabled={disabled}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Box>
  );
}
