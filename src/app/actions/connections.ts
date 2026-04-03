'use server';

import { revalidatePath } from 'next/cache';
import {
  createConnection,
  deleteConnection,
} from '@/modules/connections/db';
import { clearMcpClientCache } from '@/modules/connections/mcp/client';
import { clearComposioCache } from '@/modules/connections/platform/composio';
import { getAuthContext } from './helpers';

export interface ConnectionTool {
  name: string;
  displayName: string;
  description: string;
  tags: string[];
}

export async function createConnectionAction(connection: {
  name: string;
  provider: string;
  type: 'mcp' | 'platform';
  config: Record<string, unknown>;
}) {
  const { supabase, user, orgId } = await getAuthContext();
  const { getDefaultScope } = await import('@/modules/connections/scopes');
  const result = await createConnection(supabase, {
    org_id: orgId,
    user_id: user.id,
    scope: getDefaultScope(connection.provider),
    composio_entity_id: user.id,
    ...connection,
  });
  if (!result) return { error: 'Failed to create connection' };
  revalidatePath('/connections');
  return { success: true, connection: result };
}

export async function saveToolPermissionAction(
  connectionId: string,
  toolName: string,
  permission: 'auto' | 'confirm' | 'disabled'
) {
  const { supabase } = await getAuthContext();

  const { data: conn } = await supabase
    .from('connections')
    .select('config')
    .eq('id', connectionId)
    .single();

  if (!conn) return { error: 'Connection not found' };

  const config = (conn.config || {}) as Record<string, any>;
  const toolPermissions = config.toolPermissions || {};
  toolPermissions[toolName] = permission;

  await supabase
    .from('connections')
    .update({ config: { ...config, toolPermissions }, updated_at: new Date().toISOString() })
    .eq('id', connectionId);

  return { success: true };
}

export async function deleteConnectionAction(id: string) {
  const { supabase } = await getAuthContext();
  clearMcpClientCache(id);
  clearComposioCache();
  const success = await deleteConnection(supabase, id);
  if (!success) return { error: 'Failed to delete' };
  revalidatePath('/connections');
  return { success: true };
}

export async function syncConnectionsAction() {
  const { supabase, user, orgId } = await getAuthContext();
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return { error: 'Composio not configured' };

  // Fetch active accounts for THIS user's Composio entity
  const resp = await fetch(
    `https://backend.composio.dev/api/v1/connectedAccounts?showActiveOnly=true&user_uuid=${user.id}`,
    { headers: { 'x-api-key': apiKey } }
  );
  const data = await resp.json();
  const activeApps = [...new Set(
    ((data.items || []) as any[])
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => c.appName)
  )];

  // Check existing connections for THIS user
  const { data: existing } = await supabase
    .from('connections')
    .select('provider')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .eq('type', 'platform');
  const existingProviders = new Set((existing || []).map((c: any) => c.provider));

  const { getDefaultScope } = await import('@/modules/connections/scopes');

  let synced = 0;
  for (const appName of activeApps) {
    if (existingProviders.has(appName)) continue;
    await supabase.from('connections').insert({
      org_id: orgId,
      user_id: user.id,
      scope: getDefaultScope(appName),
      composio_entity_id: user.id,
      type: 'platform',
      name: appName,
      provider: appName,
      config: { apps: [appName] },
      status: 'active',
    });
    synced++;
  }

  if (synced > 0) {
    clearComposioCache();
  }

  revalidatePath('/connections');
  return { success: true, synced };
}

export async function updateConnectionScopeAction(
  connectionId: string,
  scope: 'personal' | 'shared'
) {
  const { supabase } = await getAuthContext();
  const { updateConnectionScope } = await import('@/modules/connections/db');
  await updateConnectionScope(supabase, connectionId, scope);
  revalidatePath('/connections');
  return { success: true };
}

export async function getConnectionToolsAction(appName: string): Promise<ConnectionTool[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return [];

  const allTools: ConnectionTool[] = [];
  let page = 1;
  const limit = 100;

  while (true) {
    const resp = await fetch(
      `https://backend.composio.dev/api/v2/actions?apps=${appName}&limit=${limit}&page=${page}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await resp.json();
    const items = data.items || [];

    for (const item of items) {
      allTools.push({
        name: item.name || '',
        displayName: item.displayName || item.name?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()) || '',
        description: item.description || '',
        tags: item.tags || [],
      });
    }

    if (items.length < limit || page >= (data.totalPages || 1)) break;
    page++;
  }

  return allTools;
}
