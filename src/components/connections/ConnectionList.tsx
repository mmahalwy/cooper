'use client';

import { useEffect, useState } from 'react';
import { Stack, Button, Title, Text, Group } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { ConnectionCard } from './ConnectionCard';
import { AddConnectionModal } from './AddConnectionModal';
import type { Connection } from '@/lib/types';

export function ConnectionList() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadConnections() {
    const res = await fetch('/api/connections');
    if (res.ok) {
      setConnections(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    loadConnections();
  }, []);

  const handleAdd = async (connection: {
    name: string;
    provider: string;
    type: 'mcp';
    config: { url: string; transport: 'sse' };
  }) => {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
    });

    if (res.ok) {
      await loadConnections();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/connections?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setConnections((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Title order={2}>Connections</Title>
            <Text c="dimmed" size="sm">Connect MCP servers to give Cooper access to tools.</Text>
          </div>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setModalOpened(true)}
          >
            Add connection
          </Button>
        </Group>

        {loading && <Text c="dimmed">Loading...</Text>}

        {!loading && connections.length === 0 && (
          <Text c="dimmed" ta="center" mt="xl">
            No connections yet. Add an MCP server to get started.
          </Text>
        )}

        {connections.map((conn) => (
          <ConnectionCard
            key={conn.id}
            connection={conn}
            onDelete={handleDelete}
          />
        ))}
      </Stack>

      <AddConnectionModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onAdd={handleAdd}
      />
    </>
  );
}
