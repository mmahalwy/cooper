'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlugIcon, TrashIcon } from 'lucide-react';
import type { Connection } from '@/lib/types';

interface ConnectionCardProps {
  connection: Connection;
  onDelete: (id: string) => void;
}

export function ConnectionCard({ connection, onDelete }: ConnectionCardProps) {
  const badgeVariant = {
    active: 'default' as const,
    inactive: 'secondary' as const,
    error: 'destructive' as const,
  }[connection.status];

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <PlugIcon className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{connection.name}</p>
            <p className="text-xs text-muted-foreground">{connection.provider}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant}>{connection.status}</Badge>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            onClick={() => onDelete(connection.id)}
          >
            <TrashIcon />
          </Button>
        </div>
      </CardContent>
      {connection.error_message && (
        <div className="px-4 pb-3">
          <p className="text-xs text-destructive">{connection.error_message}</p>
        </div>
      )}
    </Card>
  );
}
