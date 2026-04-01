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
      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => router.push(`/connections/${integration.composioApp}`)}
    >
      {integration.logo ? (
        <img
          src={integration.logo}
          alt={integration.name}
          className="size-10 rounded-lg object-contain"
        />
      ) : (
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
          {integration.name[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{integration.name}</p>
        {connected && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="size-2 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">1 account connected</span>
          </div>
        )}
      </div>
    </Card>
  );
}
