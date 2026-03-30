'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add MCP Connection</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="conn-name" className="text-sm font-medium">Name</label>
            <Input
              id="conn-name"
              placeholder="e.g., GitHub MCP Server"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="conn-url" className="text-sm font-medium">Server URL</label>
            <Input
              id="conn-url"
              placeholder="https://mcp-server.example.com/sse"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Adding...' : 'Add connection'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
