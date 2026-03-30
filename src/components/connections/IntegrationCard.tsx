'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SettingsIcon, UnplugIcon, PlugIcon } from 'lucide-react';
import type { Integration } from '@/lib/integrations-catalog';

interface IntegrationCardProps {
  integration: Integration;
  connected: boolean;
  onConnect: (integration: Integration) => void;
  onDisconnect: (integrationId: string) => void;
}

export function IntegrationCard({ integration, connected, onConnect, onDisconnect }: IntegrationCardProps) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
            {integration.name[0]}
          </div>
          <button className="text-muted-foreground hover:text-foreground">
            <SettingsIcon className="size-4" />
          </button>
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm">{integration.name}</p>
            {integration.popular && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">POPULAR</Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{integration.description}</p>
        </div>
        {connected && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">{integration.toolCount} tools enabled</span>
          </div>
        )}
        <div className="mt-auto pt-4">
          {connected ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onDisconnect(integration.id)}
            >
              <UnplugIcon className="size-4 mr-2" />
              Disconnect
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onConnect(integration)}
            >
              <PlugIcon className="size-4 mr-2" />
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
