import { SupabaseClient } from '@supabase/supabase-js';
import { getConnectionsForUser, updateConnectionStatus } from './db';
import { getMcpTools } from './mcp/client';
import type { McpServerConfig } from './mcp/types';
import { getComposioToolsForEntity } from './platform/composio';
import { withRetry } from '@/modules/agent/error-handler';

export async function getToolsForUser(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  options?: { skipApproval?: boolean }
): Promise<Record<string, any>> {
  const connections = await getConnectionsForUser(supabase, orgId, userId);
  console.log(`[registry] Found ${connections.length} connections for user ${userId.slice(0, 8)}`);

  const allTools: Record<string, any> = {};

  // Group platform connections by composio_entity_id
  const platformConnections = connections.filter(c => c.type === 'platform');
  const entitiesMap = new Map<string, typeof platformConnections>();
  for (const conn of platformConnections) {
    const entityId = (conn as any).composio_entity_id || conn.user_id || userId;
    if (!entitiesMap.has(entityId)) entitiesMap.set(entityId, []);
    entitiesMap.get(entityId)!.push(conn);
  }

  // Load Composio tools per entity
  for (const [entityId, entityConnections] of entitiesMap) {
    try {
      const composioTools = await withRetry(
        () => getComposioToolsForEntity(entityId),
        `composio-tools:${entityId}`,
        { maxRetries: 2, baseDelayMs: 1000 }
      );

      const toolPermissions: Record<string, string> = {};
      for (const conn of entityConnections) {
        const perms = (conn.config as any)?.toolPermissions;
        if (perms) Object.assign(toolPermissions, perms);
      }

      // Note: pre-resolved actions are NOT registered as individual tools
      // (too many tools degrades model performance). Meta-tools handle all actions.

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
              const inputTools: any[] = input?.tools || [];
              const blocked = inputTools.filter((t: any) => disabledSlugs.has(t?.tool_slug));
              if (blocked.length > 0) {
                return { error: `Disabled actions: ${blocked.map((t: any) => t.tool_slug).join(', ')}` };
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
                const action = slug.split('_').slice(1).join('_');
                if (action && !READ_VERBS.test(action)) return true;
              }
              return false;
            },
          };
        } else if (!allTools[name]) {
          allTools[name] = tool;
        }
      }
    } catch (error) {
      console.error(`[registry] Failed to load Composio tools for entity ${entityId}:`, error);
    }
  }

  // Load MCP tools (unchanged logic)
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
      console.error(`[registry] Failed to load MCP tools for ${conn.name}:`, error);
      await updateConnectionStatus(supabase, conn.id, 'error', String(error)).catch(() => {});
    }
  });
  await Promise.all(mcpPromises);

  return allTools;
}
