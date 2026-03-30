'use client';

import { Card, Group, Text, Badge, ActionIcon, Stack } from '@mantine/core';
import { IconTrash, IconPlug } from '@tabler/icons-react';
import type { Connection } from '@/lib/types';

interface ConnectionCardProps {
  connection: Connection;
  onDelete: (id: string) => void;
}

export function ConnectionCard({ connection, onDelete }: ConnectionCardProps) {
  const statusColor = {
    active: 'green',
    inactive: 'gray',
    error: 'red',
  }[connection.status];

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between">
        <Group gap="sm">
          <IconPlug size={20} />
          <Stack gap={2}>
            <Text fw={500} size="sm">{connection.name}</Text>
            <Text size="xs" c="dimmed">{connection.provider}</Text>
          </Stack>
        </Group>
        <Group gap="xs">
          <Badge color={statusColor} variant="light" size="sm">
            {connection.status}
          </Badge>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => onDelete(connection.id)}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      </Group>
      {connection.error_message && (
        <Text size="xs" c="red" mt="xs">{connection.error_message}</Text>
      )}
    </Card>
  );
}
