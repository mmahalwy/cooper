import { SupabaseClient } from '@supabase/supabase-js';
import { getConnectionsForOrg, updateConnectionStatus } from './db';
import { getMcpTools } from './mcp/client';
import type { McpServerConfig } from './mcp/types';
import { getComposioTools } from './platform/composio';
import type { ComposioConnectionConfig } from './platform/types';
import type { Connection } from '@/lib/types';

export async function getToolsForOrg(
  supabase: SupabaseClient,
  orgId: string,
  userId?: string
): Promise<Record<string, any>> {
  const connections = await getConnectionsForOrg(supabase, orgId);

  const allTools: Record<string, any> = {};

  const toolPromises = connections.map(async (conn) => {
    try {
      const tools = await getToolsForConnection(conn, userId);
      for (const [name, tool] of Object.entries(tools)) {
        allTools[`${conn.provider}_${name}`] = tool;
      }
    } catch (error) {
      console.error(`[registry] Failed to load tools for connection ${conn.id}:`, error);
      // Auto-disable broken connections
      await updateConnectionStatus(supabase, conn.id, 'error', String(error)).catch(() => {});
    }
  });

  await Promise.all(toolPromises);

  return allTools;
}

async function getToolsForConnection(conn: Connection, userId?: string): Promise<Record<string, any>> {
  switch (conn.type) {
    case 'mcp':
      return getMcpTools(conn.id, conn.config as unknown as McpServerConfig);
    case 'custom':
      return {};
    case 'platform': {
      const platformConfig = conn.config as unknown as ComposioConnectionConfig;
      if (userId && !platformConfig.entityId) {
        platformConfig.entityId = userId;
      }
      return getComposioTools(conn.id, platformConfig);
    }
    default:
      return {};
  }
}
