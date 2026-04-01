import { SupabaseClient } from '@supabase/supabase-js';
import { getConnectionsForOrg, updateConnectionStatus } from './db';
import { getMcpTools } from './mcp/client';
import type { McpServerConfig } from './mcp/types';
import { getComposioTools } from './platform/composio';
import type { Connection } from '@/lib/types';
import { withRetry } from '@/modules/agent/error-handler';

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
      const composioTools = await withRetry(
        () => getComposioTools('default'),
        'composio-tools',
        { maxRetries: 2, baseDelayMs: 1000 }
      );
      console.log(`[registry] Composio tools:`, Object.keys(composioTools));

      // Build a map of tool_slug → permission from all platform connections' config
      const toolPermissions: Record<string, string> = {};
      for (const conn of platformConnections) {
        const perms = (conn.config as any)?.toolPermissions;
        if (perms) {
          Object.assign(toolPermissions, perms);
        }
      }

      // Note: Pre-resolved actions are stored in connections.config.resolvedActions
      // but NOT registered as individual tools — too many tools degrades model performance.
      // The meta-tools (SEARCH_TOOLS, MULTI_EXECUTE_TOOL) handle all actions.
      const READ_VERBS = /^(GET|LIST|SEARCH|FIND|FETCH|READ|RETRIEVE|QUERY|CHECK|SHOW|VIEW|DESCRIBE|COUNT|LOOKUP|DOWNLOAD)/i;

      for (const [name, tool] of Object.entries(composioTools)) {
        if (name === 'COMPOSIO_MULTI_EXECUTE_TOOL' && !options?.skipApproval) {
          const disabledSlugs = new Set(
            Object.entries(toolPermissions)
              .filter(([_, perm]) => perm === 'disabled')
              .map(([slug]) => slug)
          );

          const originalExecute = tool.execute;
          allTools[name] = {
            ...tool,
            execute: async (input: any) => {
              // Block disabled slugs before execution
              const inputTools: any[] = input?.tools || [];
              const blocked = inputTools.filter((t: any) => disabledSlugs.has(t?.tool_slug));
              if (blocked.length > 0) {
                return {
                  error: `The following actions are disabled: ${blocked.map((t: any) => t.tool_slug).join(', ')}. They can be re-enabled in the connection settings.`,
                };
              }
              return originalExecute?.(input);
            },
            needsApproval: (input: any) => {
              const inputTools: any[] = input?.tools || [];
              for (const t of inputTools) {
                const slug = t?.tool_slug || '';
                const perm = toolPermissions[slug];
                console.log(`[registry] Approval check: slug=${slug} perm=${perm || 'none'}`);
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
      const tools = await withRetry(
        () => getMcpTools(conn.id, conn.config as unknown as McpServerConfig),
        `mcp-tools:${conn.name}`,
        { maxRetries: 1, baseDelayMs: 500 }
      );
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
