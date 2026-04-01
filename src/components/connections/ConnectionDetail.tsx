'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { ArrowLeftIcon, UnplugIcon, SearchIcon } from 'lucide-react';
import { saveToolPermissionAction } from '@/app/actions';
import type { ConnectionTool } from '@/app/actions';

type ToolPermission = 'auto' | 'confirm' | 'disabled';

interface ConnectionDetailProps {
  appName: string;
  connectionId: string | null;
  displayName: string;
  description: string;
  tools: ConnectionTool[];
  savedPermissions: Record<string, ToolPermission>;
}

function isReadTool(name: string) {
  return /GET|LIST|SEARCH|QUERY|RETRIEVE|FETCH/.test(name);
}

export function ConnectionDetail({ appName, connectionId, displayName, description, tools, savedPermissions }: ConnectionDetailProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Initialize from saved permissions, falling back to defaults
  const [permissions, setPermissions] = useState<Record<string, ToolPermission>>(() => {
    const initial: Record<string, ToolPermission> = {};
    for (const tool of tools) {
      initial[tool.name] = savedPermissions[tool.name] ?? (isReadTool(tool.name) ? 'auto' : 'confirm');
    }
    return initial;
  });

  const setPermission = (toolName: string, permission: ToolPermission) => {
    setPermissions((prev) => ({ ...prev, [toolName]: permission }));
    if (connectionId) {
      saveToolPermissionAction(connectionId, toolName, permission);
    }
  };

  // Deduplicate tools by name
  const uniqueTools = tools.filter((t, i, arr) => arr.findIndex((x) => x.name === t.name) === i);

  const filtered = uniqueTools.filter((t) =>
    !search ||
    t.displayName.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const readTools = filtered.filter((t) => isReadTool(t.name));
  const writeTools = filtered.filter((t) => !isReadTool(t.name));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="icon" className="size-9" onClick={() => router.push('/connections')}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg font-semibold">
          {displayName[0]}
        </div>
        <h1 className="text-2xl font-semibold">{displayName}</h1>
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed mb-6">
        {description || `With ${displayName}, Cooper can access and interact with your ${displayName} data and workflows.`}
      </p>

      <div className="flex justify-end mb-6">
        <Button variant="outline" size="sm" className="text-destructive">
          <UnplugIcon className="size-4 mr-2" />
          Disconnect
        </Button>
      </div>

      <Separator className="mb-6" />

      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-sm">Enable integration</p>
          <p className="text-xs text-muted-foreground">Allow Cooper to use {displayName} tools</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <p className="text-xs text-muted-foreground mb-6">All team members can use this integration</p>

      <Separator className="mb-6" />

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

      {readTools.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Read-only ({readTools.length})</p>
          <div className="flex flex-col divide-y rounded-lg border">
            {readTools.map((tool) => (
              <ToolRow
                key={tool.name}
                tool={tool}
                permission={permissions[tool.name] || 'auto'}
                onPermissionChange={(p) => setPermission(tool.name, p)}
              />
            ))}
          </div>
        </div>
      )}

      {writeTools.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Actions ({writeTools.length})</p>
          <div className="flex flex-col divide-y rounded-lg border">
            {writeTools.map((tool) => (
              <ToolRow
                key={tool.name}
                tool={tool}
                permission={permissions[tool.name] || 'confirm'}
                onPermissionChange={(p) => setPermission(tool.name, p)}
              />
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

function ToolRow({ tool, permission, onPermissionChange }: {
  tool: ConnectionTool;
  permission: ToolPermission;
  onPermissionChange: (p: ToolPermission) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{tool.displayName}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
      </div>
      <Select value={permission} onValueChange={(v) => onPermissionChange(v as ToolPermission)}>
        <SelectTrigger className="w-[180px] shrink-0 text-xs h-8">
          {permission === 'auto' ? 'Run automatically' : permission === 'confirm' ? 'Ask for confirmation' : 'Off'}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="disabled">Off</SelectItem>
          <SelectItem value="auto">Run automatically</SelectItem>
          <SelectItem value="confirm">Ask for confirmation</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
