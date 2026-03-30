import { SupabaseClient } from '@supabase/supabase-js';
import { getConnectionsForOrg } from './db';
import { getMcpTools } from './mcp/client';
import type { McpServerConfig } from './mcp/types';
import { getComposioTools } from './platform/composio';
import type { ComposioConnectionConfig } from './platform/types';
import type { Connection } from '@/lib/types';

export async function getToolsForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, any>> {
  const connections = await getConnectionsForOrg(supabase, orgId);

  const allTools: Record<string, any> = {};

  // Load tools from each active connection in parallel
  const toolPromises = connections.map(async (conn) => {
    try {
      const tools = await getToolsForConnection(conn);
      // Prefix tool names with connection name to avoid collisions
      for (const [name, tool] of Object.entries(tools)) {
        allTools[`${conn.provider}_${name}`] = tool;
      }
    } catch (error) {
      console.error(`[registry] Failed to load tools for connection ${conn.id}:`, error);
    }
  });

  await Promise.all(toolPromises);

  return allTools;
}

async function getToolsForConnection(conn: Connection): Promise<Record<string, any>> {
  switch (conn.type) {
    case 'mcp':
      return getMcpTools(conn.id, conn.config as unknown as McpServerConfig);
    case 'custom':
      // Phase 2b: custom connectors
      return {};
    case 'platform':
      return getComposioTools(conn.id, conn.config as unknown as ComposioConnectionConfig);
    default:
      return {};
  }
}
