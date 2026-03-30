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
import { cn } from '@/lib/utils';

interface AddConnectionModalProps {
  opened: boolean;
  onClose: () => void;
  onAdd: (connection: {
    name: string;
    provider: string;
    type: 'mcp' | 'platform';
    config: Record<string, unknown>;
  }) => void;
}

type ConnectionType = 'mcp' | 'composio';

export function AddConnectionModal({ opened, onClose, onAdd }: AddConnectionModalProps) {
  const [connType, setConnType] = useState<ConnectionType>('mcp');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [entityId, setEntityId] = useState('');
  const [apps, setApps] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (connType === 'mcp') {
      if (!name.trim() || !url.trim()) { setLoading(false); return; }
      await onAdd({
        name: name.trim(),
        provider: name.trim().toLowerCase().replace(/\s+/g, '-'),
        type: 'mcp',
        config: { url: url.trim(), transport: 'sse' },
      });
    } else {
      if (!name.trim() || !apiKey.trim() || !apps.trim()) { setLoading(false); return; }
      await onAdd({
        name: name.trim(),
        provider: 'composio',
        type: 'platform',
        config: {
          apiKey: apiKey.trim(),
          entityId: entityId.trim() || 'default',
          apps: apps.split(',').map((a) => a.trim()).filter(Boolean),
        },
      });
    }

    setLoading(false);
    setName('');
    setUrl('');
    setApiKey('');
    setEntityId('');
    setApps('');
    onClose();
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Connection</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-sm',
              connType === 'mcp' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
            onClick={() => setConnType('mcp')}
          >
            MCP Server
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-sm',
              connType === 'composio' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
            onClick={() => setConnType('composio')}
          >
            Composio
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder={connType === 'mcp' ? 'e.g., GitHub MCP Server' : 'e.g., My Composio Tools'}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {connType === 'mcp' ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Server URL</label>
              <Input
                placeholder="https://mcp-server.example.com/sse"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Composio API Key</label>
                <Input
                  type="password"
                  placeholder="Your Composio API key"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Entity ID (optional)</label>
                <Input
                  placeholder="default"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Maps to a user/org in Composio. Leave blank for &quot;default&quot;.</p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Apps</label>
                <Input
                  placeholder="github, linear, slack, notion"
                  required
                  value={apps}
                  onChange={(e) => setApps(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of Composio app names.</p>
              </div>
            </>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Adding...' : 'Add connection'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
