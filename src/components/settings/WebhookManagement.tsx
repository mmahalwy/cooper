'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  getWebhooksAction,
  createWebhookAction,
  deleteWebhookAction,
  toggleWebhookAction,
} from '@/app/actions';
import { PlusIcon, TrashIcon, CopyIcon, CheckIcon, LinkIcon } from 'lucide-react';

interface WebhookItem {
  id: string;
  name: string;
  secret: string;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export function WebhookManagement() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [name, setName] = useState('');
  const [newWebhook, setNewWebhook] = useState<{ url: string; secret: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [isPending, startTransition] = useTransition();

  function loadWebhooks() {
    startTransition(async () => {
      const data = await getWebhooksAction();
      setWebhooks(data);
    });
  }

  useEffect(() => { loadWebhooks(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      const result = await createWebhookAction(name);
      if ('url' in result) {
        setNewWebhook({ url: result.url, secret: result.secret });
        setName('');
        loadWebhooks();
      }
    });
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">Receive messages from external systems</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">
        {newWebhook && (
          <Card className="border-blue-500/50 bg-blue-500/5">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Webhook created! Save these details:</p>
              <div>
                <label className="text-xs text-muted-foreground">URL</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono">{newWebhook.url}</code>
                  <Button variant="outline" size="sm" onClick={() => copy(newWebhook.url, 'url')}>
                    {copied === 'url' ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Secret (for Authorization header)</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono break-all">{newWebhook.secret}</code>
                  <Button variant="outline" size="sm" onClick={() => copy(newWebhook.secret, 'secret')}>
                    {copied === 'secret' ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                <p className="font-medium mb-1">Usage:</p>
                <pre className="whitespace-pre-wrap">{`curl -X POST ${newWebhook.url} \\
  -H "Authorization: Bearer ${newWebhook.secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello Cooper!"}'`}</pre>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewWebhook(null)}>Dismiss</Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <PlusIcon className="size-4" /> Create Webhook
            </h3>
            <form onSubmit={handleCreate} className="flex gap-2">
              <Input
                placeholder="Webhook name (e.g., Slack, GitHub)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isPending || !name.trim()}>Create</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <LinkIcon className="size-4" /> Active Webhooks ({webhooks.length})
            </h3>
            {webhooks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No webhooks yet</p>
            ) : (
              <div className="space-y-2">
                {webhooks.map((wh) => (
                  <div key={wh.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{wh.name}</p>
                        <Badge variant={wh.is_active ? 'default' : 'secondary'} className="text-[10px]">
                          {wh.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      {wh.last_triggered_at && (
                        <p className="text-[10px] text-muted-foreground">
                          Last triggered {new Date(wh.last_triggered_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={wh.is_active}
                        onCheckedChange={(checked) => {
                          startTransition(async () => {
                            await toggleWebhookAction(wh.id, !!checked);
                            loadWebhooks();
                          });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          startTransition(async () => {
                            await deleteWebhookAction(wh.id);
                            loadWebhooks();
                          });
                        }}
                      >
                        <TrashIcon className="size-3.5 text-destructive" />
                      </Button>
                    </div>
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
