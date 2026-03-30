'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
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
    type: 'mcp' | 'platform';
    config: Record<string, unknown>;
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
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Connections</h2>
            <p className="text-sm text-muted-foreground">Connect MCP servers to give Cooper access to tools.</p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Add connection
          </Button>
        </div>

        {loading && <p className="text-muted-foreground">Loading...</p>}

        {!loading && connections.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No connections yet. Add an MCP server to get started.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      <AddConnectionModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onAdd={handleAdd}
      />
    </>
  );
}
