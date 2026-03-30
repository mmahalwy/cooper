'use client';

import { Stack, Button, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

export function ChatSidebar() {
  const router = useRouter();

  return (
    <Stack h="100%" gap="sm">
      <Button
        leftSection={<IconPlus size={16} />}
        variant="light"
        fullWidth
        onClick={() => router.push('/chat')}
      >
        New chat
      </Button>
      <Text size="xs" c="dimmed" mt="md">
        No conversations yet
      </Text>
    </Stack>
  );
}
