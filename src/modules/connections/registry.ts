import { SupabaseClient } from '@supabase/supabase-js';
import { getConnectionsForOrg, updateConnectionStatus } from './db';
import { getMcpTools } from './mcp/client';
import type { McpServerConfig } from './mcp/types';
import { getComposioTools } from './platform/composio';
import type { Connection } from '@/lib/types';

export async function getToolsForOrg(
  supabase: SupabaseClient,
  orgId: string,
  userId?: string,
  options?: { skipApproval?: boolean }
): Promise<Record<string, any>> {
  const connections = await getConnectionsForOrg(supabase, orgId);
  console.log(`[registry] Found ${connections.length} active connections:`, connections.map(c => `${c.name}(${c.type}:${c.id.slice(0, 8)})`));

  const allTools: Record<string, any> = {};

  // Load Composio tools once (uses 'default' entity)
  const platformConnections = connections.filter(c => c.type === 'platform');
  if (platformConnections.length > 0) {
    try {
      const composioTools = await getComposioTools('default');
      console.log(`[registry] Composio tools:`, Object.keys(composioTools));

      // Build a map of tool_slug → permission from all platform connections' config
      const toolPermissions: Record<string, string> = {};
      for (const conn of platformConnections) {
        const perms = (conn.config as any)?.toolPermissions;
        if (perms) {
          Object.assign(toolPermissions, perms);
        }
      }

      const READ_VERBS = /^(GET|LIST|SEARCH|FIND|FETCH|READ|RETRIEVE|QUERY|CHECK|SHOW|VIEW|DESCRIBE|COUNT|LOOKUP|DOWNLOAD)/i;

      for (const [name, tool] of Object.entries(composioTools)) {
        if (name === 'COMPOSIO_MULTI_EXECUTE_TOOL' && !options?.skipApproval) {
          allTools[name] = {
            ...tool,
            needsApproval: (input: any) => {
              const inputTools: any[] = input?.tools || [];
              for (const t of inputTools) {
                const slug = t?.tool_slug || '';
                // Check saved permission for this specific tool slug
                const perm = toolPermissions[slug];
                console.log(`[registry] Approval check: slug=${slug} perm=${perm || 'none'}`);
                if (perm === 'disabled') return true;
                if (perm === 'confirm') return true;
                if (perm === 'auto') continue;
                // No saved permission — fall back to verb-based detection
                const action = slug.split('_').slice(1).join('_');
                if (action && !READ_VERBS.test(action)) return true;
              }
              return false;
            },
          };
        } else {
          allTools[name] = tool;
        }
      }
    } catch (error) {
      console.error('[registry] Failed to load Composio tools:', error);
    }
  }

  // Load MCP tools per connection
  const mcpConnections = connections.filter(c => c.type === 'mcp');
  const mcpPromises = mcpConnections.map(async (conn) => {
    try {
      const tools = await getMcpTools(conn.id, conn.config as unknown as McpServerConfig);
      for (const [name, tool] of Object.entries(tools)) {
        allTools[`${conn.provider}_${name}`] = tool;
      }
    } catch (error) {
      console.error(`[registry] Failed to load MCP tools for ${conn.name} (${conn.id.slice(0, 8)}):`, error);
      await updateConnectionStatus(supabase, conn.id, 'error', String(error)).catch(() => {});
    }
  });

  await Promise.all(mcpPromises);

  return allTools;
}
