'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ArrowLeftIcon, UnplugIcon, SearchIcon } from 'lucide-react';
import { deleteConnectionAction } from '@/app/actions';
import type { ConnectionTool } from '@/app/actions';

interface ConnectionDetailProps {
  appName: string;
  displayName: string;
  description: string;
  tools: ConnectionTool[];
}

export function ConnectionDetail({ appName, displayName, description, tools }: ConnectionDetailProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [enabled, setEnabled] = useState(true);

  const filtered = tools.filter((t) =>
    !search ||
    t.displayName.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const readTools = filtered.filter((t) =>
    t.name.includes('GET') || t.name.includes('LIST') || t.name.includes('SEARCH') || t.name.includes('QUERY') || t.name.includes('RETRIEVE') || t.name.includes('FETCH')
  );
  const writeTools = filtered.filter((t) => !readTools.includes(t));

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="icon" className="size-9" onClick={() => router.push('/connections')}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
          {displayName[0]}
        </div>
        <h1 className="text-2xl font-semibold">{displayName}</h1>
      </div>

      {/* Description */}
      <p className="text-muted-foreground text-sm leading-relaxed mb-6">
        {description || `With ${displayName}, Cooper can access and interact with your ${displayName} data and workflows.`}
      </p>

      {/* Disconnect */}
      <div className="flex justify-end mb-6">
        <Button variant="outline" size="sm" className="text-destructive">
          <UnplugIcon className="size-4 mr-2" />
          Disconnect
        </Button>
      </div>

      <Separator className="mb-6" />

      {/* Enable toggle */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-sm">Enable integration</p>
          <p className="text-xs text-muted-foreground">Allow Cooper to use {displayName} tools</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <p className="text-xs text-muted-foreground mb-6">All team members can use this integration</p>

      <Separator className="mb-6" />

      {/* Tools section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Tools</h2>
        <Badge variant="secondary">{tools.length} total</Badge>
      </div>

      <div className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Read tools */}
      {readTools.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Read-only ({readTools.length})</p>
          <div className="flex flex-col divide-y rounded-lg border">
            {readTools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} mode="auto" />
            ))}
          </div>
        </div>
      )}

      {/* Write tools */}
      {writeTools.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Actions ({writeTools.length})</p>
          <div className="flex flex-col divide-y rounded-lg border">
            {writeTools.map((tool) => (
              <ToolRow key={tool.name} tool={tool} mode="confirm" />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No tools found matching your search.</p>
      )}
    </div>
  );
}

function ToolRow({ tool, mode }: { tool: ConnectionTool; mode: 'auto' | 'confirm' }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{tool.displayName}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
      </div>
      <Badge variant={mode === 'auto' ? 'secondary' : 'outline'} className="shrink-0 text-xs">
        {mode === 'auto' ? 'Run automatically' : 'Ask for confirmation'}
      </Badge>
    </div>
  );
}
