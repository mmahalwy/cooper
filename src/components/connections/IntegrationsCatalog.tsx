'use client';

import { useEffect, useState, useMemo, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Card } from '@/components/ui/card';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'communication', label: 'Communication', match: ['communication', 'team chat', 'email', 'phone & sms'] },
  { id: 'project-management', label: 'Project Management', match: ['project management', 'task management', 'productivity & project management'] },
  { id: 'analytics', label: 'Analytics', match: ['analytics', 'business intelligence', 'dashboards'] },
  { id: 'crm', label: 'CRM', match: ['crm', 'sales & crm', 'contact management'] },
  { id: 'development', label: 'Development', match: ['developer tools', 'developer tools & devops', 'databases'] },
  { id: 'productivity', label: 'Productivity', match: ['productivity', 'notes', 'documents', 'calendar', 'spreadsheets', 'file management & storage'] },
  { id: 'marketing', label: 'Marketing', match: ['marketing', 'marketing automation', 'social media marketing', 'email newsletters'] },
  { id: 'finance', label: 'Finance', match: ['accounting', 'payment processing', 'taxes'] },
];

interface IntegrationsCatalogProps {
  initialConnections?: Connection[];
  integrations: Integration[];
  userId: string;
}

export function IntegrationsCatalog({ initialConnections = [], integrations, userId }: IntegrationsCatalogProps) {
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [showConnectedOnly, setShowConnectedOnly] = useState(searchParams.get('connected') === 'true');
  const [mcpModalOpened, setMcpModalOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Sync filters to URL
  const updateURL = useCallback((q: string, cat: string, connected: boolean) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cat !== 'all') params.set('category', cat);
    if (connected) params.set('connected', 'true');
    const qs = params.toString();
    window.history.replaceState(null, '', `/connections${qs ? `?${qs}` : ''}`);
  }, []);

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

  const yourConnections = useMemo(() =>
    connections.filter(c => c.user_id === userId),
    [connections, userId]
  );

  const teamConnections = useMemo(() =>
    connections.filter(c => c.user_id !== userId && c.scope === 'shared'),
    [connections, userId]
  );

  const filtered = useMemo(() => {
    const activeCat = CATEGORIES.find(c => c.id === category);
    const matchTerms = activeCat && 'match' in activeCat ? activeCat.match : null;

    return integrations.filter((i) => {
      const matchesSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
      const matchesConnected = !showConnectedOnly || connectedIds.has(i.id);
      const matchesCategory = !matchTerms || matchTerms.some(term =>
        i.category.toLowerCase() === term.toLowerCase()
      );
      return matchesSearch && matchesConnected && matchesCategory;
    }).sort((a, b) => {
      const aConnected = connectedIds.has(a.id) ? 0 : 1;
      const bConnected = connectedIds.has(b.id) ? 0 : 1;
      if (aConnected !== bConnected) return aConnected - bConnected;
      return a.name.localeCompare(b.name);
    });
  }, [search, category, showConnectedOnly, connectedIds, integrations]);

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
          onChange={(e) => { setSearch(e.target.value); updateURL(e.target.value, category, showConnectedOnly); }}
          className="pl-10"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); updateURL(search, cat.id, showConnectedOnly); }}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                category === cat.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">Connected only</span>
          <Switch checked={showConnectedOnly} onCheckedChange={(v) => { setShowConnectedOnly(v); updateURL(search, category, v); }} />
        </div>
      </div>

      {/* Your Connections */}
      {yourConnections.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Your Connections</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {yourConnections.map((conn) => {
              const integration = integrations.find(i => i.composioApp === conn.provider || i.id === conn.provider);
              return (
                <Card key={conn.id} className="flex items-center gap-3 p-3 border-border/50">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/50 overflow-hidden">
                    {integration?.logo ? (
                      <img src={integration.logo} alt="" className="size-5 object-contain" />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">{conn.name[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{integration?.name || conn.name}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {conn.scope === 'personal' ? '🔒 Personal' : '🌐 Shared'}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Connections */}
      {teamConnections.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Team Connections</h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {teamConnections.map((conn) => {
              const integration = integrations.find(i => i.composioApp === conn.provider || i.id === conn.provider);
              return (
                <Card key={conn.id} className="flex items-center gap-3 p-3 border-border/50 opacity-80">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/50 overflow-hidden">
                    {integration?.logo ? (
                      <img src={integration.logo} alt="" className="size-5 object-contain" />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">{conn.name[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{integration?.name || conn.name}</p>
                    <span className="text-[10px] text-muted-foreground">🌐 Shared</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

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
