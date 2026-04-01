'use client';

import { useEffect, useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { IntegrationCard } from './IntegrationCard';
import { AddConnectionModal } from './AddConnectionModal';
import type { Integration } from '@/lib/integrations-catalog';
import {
  syncConnectionsAction,
  createConnectionAction,
} from '@/app/actions';
import type { Connection } from '@/lib/types';
import { cn } from '@/lib/utils';

interface IntegrationsCatalogProps {
  initialConnections?: Connection[];
  integrations: Integration[];
}

export function IntegrationsCatalog({ initialConnections = [], integrations }: IntegrationsCatalogProps) {
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'popular'>('all');
  const [showConnectedOnly, setShowConnectedOnly] = useState(false);
  const [mcpModalOpened, setMcpModalOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    startTransition(async () => {
      await syncConnectionsAction();
      router.refresh();
    });
  }, []);

  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    connections.forEach((c) => {
      const match = integrations.find(
        (i) => i.composioApp === c.provider || i.id === c.provider || c.name.toLowerCase().includes(i.name.toLowerCase())
      );
      if (match) ids.add(match.id);
    });
    return ids;
  }, [connections, integrations]);

  const filtered = useMemo(() => {
    return integrations.filter((i) => {
      const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
      const matchesConnected = !showConnectedOnly || connectedIds.has(i.id);
      const matchesTab = tab === 'all' || (tab === 'popular' && i.toolCount > 15);
      return matchesSearch && matchesConnected && matchesTab;
    }).sort((a, b) => {
      const aConnected = connectedIds.has(a.id) ? 0 : 1;
      const bConnected = connectedIds.has(b.id) ? 0 : 1;
      if (aConnected !== bConnected) return aConnected - bConnected;
      return a.name.localeCompare(b.name);
    });
  }, [search, tab, showConnectedOnly, connectedIds, integrations]);

  const handleMcpAdd = async (connection: {
    name: string;
    provider: string;
    type: 'mcp' | 'platform';
    config: Record<string, unknown>;
  }) => {
    const result = await createConnectionAction(connection);
    if (result.success) router.refresh();
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
        <Button variant="outline" onClick={() => setMcpModalOpened(true)}>
          <PlusIcon className="size-4 mr-2" />
          Add Custom MCP
        </Button>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={`Search from ${integrations.length} integrations...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('all')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              tab === 'all' ? 'bg-muted font-medium' : 'hover:bg-muted/50'
            )}
          >
            All integrations
          </button>
          <button
            onClick={() => setTab('popular')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              tab === 'popular' ? 'bg-muted font-medium' : 'hover:bg-muted/50'
            )}
          >
            Popular integrations
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show connected only</span>
          <Switch checked={showConnectedOnly} onCheckedChange={setShowConnectedOnly} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            connected={connectedIds.has(integration.id)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-3 text-center text-muted-foreground py-8">
            No integrations found.
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
