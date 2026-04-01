'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import type { Integration } from '@/lib/integrations-catalog';

interface IntegrationCardProps {
  integration: Integration;
  connected: boolean;
}

export function IntegrationCard({ integration, connected }: IntegrationCardProps) {
  const router = useRouter();

  return (
    <Card
      className="flex flex-row items-center gap-3 p-3.5 cursor-pointer border-border/50 hover:border-border hover:bg-muted/30 transition-all"
      onClick={() => router.push(`/connections/${integration.composioApp}`)}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted/50 overflow-hidden">
        {integration.logo ? (
          <img
            src={integration.logo}
            alt=""
            className="size-6 object-contain"
          />
        ) : (
          <span className="text-sm font-semibold text-muted-foreground">
            {integration.name[0]}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{integration.name}</p>
        {connected && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="size-1.5 rounded-full bg-green-500" />
            <span className="text-[11px] text-muted-foreground">Connected</span>
          </div>
        )}
      </div>
    </Card>
  );
}
