'use client';

import { useState } from 'react';
import { Modal, TextInput, Button, Stack } from '@mantine/core';

interface AddConnectionModalProps {
  opened: boolean;
  onClose: () => void;
  onAdd: (connection: {
    name: string;
    provider: string;
    type: 'mcp';
    config: { url: string; transport: 'sse' };
  }) => void;
}

export function AddConnectionModal({ opened, onClose, onAdd }: AddConnectionModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    setLoading(true);
    await onAdd({
      name: name.trim(),
      provider: name.trim().toLowerCase().replace(/\s+/g, '-'),
      type: 'mcp',
      config: { url: url.trim(), transport: 'sse' },
    });
    setLoading(false);
    setName('');
    setUrl('');
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add MCP Connection">
      <form onSubmit={handleSubmit}>
        <Stack>
          <TextInput
            label="Name"
            placeholder="e.g., GitHub MCP Server"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <TextInput
            label="Server URL"
            placeholder="https://mcp-server.example.com/sse"
            required
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
          <Button type="submit" loading={loading} fullWidth>
            Add connection
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
