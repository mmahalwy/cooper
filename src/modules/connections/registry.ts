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
  const hasPlatformConnections = connections.some(c => c.type === 'platform');
  if (hasPlatformConnections) {
    try {
      const composioTools = await getComposioTools('default');
      console.log(`[registry] Composio tools:`, Object.keys(composioTools));

      // Require user approval for write operations via COMPOSIO_MULTI_EXECUTE_TOOL.
      // The tool input has tools[].tool_slug — read-like slugs skip approval.
      const READ_VERBS = /^(GET|LIST|SEARCH|FIND|FETCH|READ|RETRIEVE|QUERY|CHECK|SHOW|VIEW|DESCRIBE|COUNT|LOOKUP|DOWNLOAD)/i;

      for (const [name, tool] of Object.entries(composioTools)) {
        if (name === 'COMPOSIO_MULTI_EXECUTE_TOOL' && !options?.skipApproval) {
          allTools[name] = {
            ...tool,
            needsApproval: (input: any) => {
              const slugs: string[] = (input?.tools || []).map((t: any) => {
                const slug = t?.tool_slug || '';
                // Strip the service prefix (e.g., SLACK_SEND_MESSAGE → SEND_MESSAGE)
                const parts = slug.split('_');
                return parts.length > 1 ? parts.slice(1).join('_') : slug;
              });
              // If every action slug starts with a read verb, skip approval
              return slugs.length > 0 && !slugs.every((s) => READ_VERBS.test(s));
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
