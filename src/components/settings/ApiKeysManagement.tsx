'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiKeysAction, createApiKeyAction, revokeApiKeyAction } from '@/app/actions';
import { KeyIcon, PlusIcon, TrashIcon, CopyIcon, CheckIcon, EyeIcon } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export function ApiKeysManagement() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadKeys() {
    startTransition(async () => {
      const data = await getApiKeysAction();
      setKeys(data);
    });
  }

  useEffect(() => { loadKeys(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      const result = await createApiKeyAction(name);
      if ('key' in result) {
        setNewKey(result.key);
        setName('');
        loadKeys();
      }
    });
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    startTransition(async () => {
      await revokeApiKeyAction(id);
      loadKeys();
    });
  }

  function copyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">API Keys</h1>
        <p className="text-sm text-muted-foreground">Manage API keys for programmatic access</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
        {/* New Key Alert */}
        {newKey && (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <EyeIcon className="size-5 text-green-600 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Your new API key</p>
                  <p className="text-xs text-muted-foreground">
                    Copy this key now. You won&apos;t be able to see it again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
                      {newKey}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyKey}>
                      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setNewKey(null)} className="text-xs">
                    Dismiss
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <PlusIcon className="size-4" />
              Create API Key
            </h3>
            <form onSubmit={handleCreate} className="flex gap-2">
              <Input
                placeholder="Key name (e.g., CI/CD, Slack Bot)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isPending || !name.trim()}>
                Create
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Keys List */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <KeyIcon className="size-4" />
              Active Keys ({keys.length})
            </h3>
            {keys.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No API keys yet</p>
            ) : (
              <div className="space-y-2">
                {keys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{key.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-[10px] text-muted-foreground font-mono">{key.key_prefix}</code>
                        <span className="text-[10px] text-muted-foreground">
                          Created {new Date(key.created_at).toLocaleDateString()}
                        </span>
                        {key.last_used_at && (
                          <span className="text-[10px] text-muted-foreground">
                            Last used {new Date(key.last_used_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRevoke(key.id)}>
                      <TrashIcon className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
