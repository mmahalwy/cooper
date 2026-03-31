'use client';

import { useEffect, useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { IntegrationCard } from './IntegrationCard';
import { AddConnectionModal } from './AddConnectionModal';
import { INTEGRATIONS, CATEGORIES, type Integration } from '@/lib/integrations-catalog';
import type { Connection } from '@/lib/types';
import { cn } from '@/lib/utils';

interface IntegrationsCatalogProps {
  initialConnections?: Connection[];
}

export function IntegrationsCatalog({ initialConnections = [] }: IntegrationsCatalogProps) {
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [mcpModalOpened, setMcpModalOpened] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function loadConnections() {
    const res = await fetch('/api/connections');
    if (res.ok) setConnections(await res.json());
  }

  useEffect(() => {
    // Auto-sync from Composio on load
    fetch('/api/connections/sync', { method: 'POST' })
      .then(() => loadConnections())
      .catch(() => {});
  }, []);

  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    connections.forEach((c) => {
      // Match by provider name against integration composioApp or id
      const match = INTEGRATIONS.find(
        (i) => i.composioApp === c.provider || i.id === c.provider || c.name.toLowerCase().includes(i.name.toLowerCase())
      );
      if (match) ids.add(match.id);
    });
    return ids;
  }, [connections]);

  const filtered = useMemo(() => {
    return INTEGRATIONS.filter((i) => {
      const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === 'All' || i.category === category;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => {
      // Connected apps first
      const aConnected = connectedIds.has(a.id) ? 0 : 1;
      const bConnected = connectedIds.has(b.id) ? 0 : 1;
      if (aConnected !== bConnected) return aConnected - bConnected;
      // Then popular first
      const aPopular = a.popular ? 0 : 1;
      const bPopular = b.popular ? 0 : 1;
      return aPopular - bPopular;
    });
  }, [search, category, connectedIds]);

  const handleConnect = async (integration: Integration) => {
    const initiateRes = await fetch('/api/connections/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName: integration.composioApp }),
    });

    if (!initiateRes.ok) {
      console.error('Failed to initiate connection');
      return;
    }

    const data = await initiateRes.json();

    // Open Composio's connect page — handles all auth types
    if (data.redirectUrl) {
      window.open(data.redirectUrl, '_blank');
    }
  };

  const handleRefreshConnections = async () => {
    setSyncing(true);
    const res = await fetch('/api/connections/sync', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      console.log('[sync] Result:', data);
    }
    await loadConnections();
    setSyncing(false);
  };

  const handleDisconnect = async (integrationId: string) => {
    const conn = connections.find((c) => {
      const match = INTEGRATIONS.find((i) => i.id === integrationId);
      return match && (c.provider === match.composioApp || c.provider === match.id);
    });
    if (!conn) return;

    const res = await fetch(`/api/connections?id=${conn.id}`, { method: 'DELETE' });
    if (res.ok) setConnections((prev) => prev.filter((c) => c.id !== conn.id));
  };

  const handleMcpAdd = async (connection: {
    name: string;
    provider: string;
    type: 'mcp' | 'platform';
    config: Record<string, unknown>;
  }) => {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connection),
    });
    if (res.ok) await loadConnections();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect the tools you use and let Cooper perform tasks across various apps.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefreshConnections} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Refresh'}
          </Button>
          <Button variant="outline" onClick={() => setMcpModalOpened(true)}>
            <PlusIcon className="size-4 mr-2" />
            Add Custom MCP
          </Button>
        </div>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search all integrations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
              category === cat
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              connected={connectedIds.has(integration.id)}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-2 text-center text-muted-foreground py-8">
              No integrations found matching your search.
            </p>
          )}
        </div>

      <AddConnectionModal
        opened={mcpModalOpened}
        onClose={() => setMcpModalOpened(false)}
        onAdd={handleMcpAdd}
      />

    </div>
  );
}
