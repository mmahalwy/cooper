import { tool, jsonSchema } from 'ai';

export interface ResolvedAction {
  slug: string;
  displayName: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Fetch top actions for an app from Composio API.
 */
export async function fetchActionsForApp(
  appName: string,
  limit: number = 20
): Promise<ResolvedAction[]> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return [];

  try {
    const resp = await fetch(
      `https://backend.composio.dev/api/v2/actions?apps=${appName}&limit=${limit}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await resp.json();
    const items = data.items || [];

    return items.map((item: any) => ({
      slug: item.name || '',
      displayName: item.displayName || item.name?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()) || '',
      description: item.description || '',
      parameters: item.parameters || { type: 'object', properties: {} },
    }));
  } catch (error) {
    console.error(`[action-resolver] Failed to fetch actions for ${appName}:`, error);
    return [];
  }
}

/**
 * Create AI SDK tool wrappers from resolved actions.
 * Each wrapper calls COMPOSIO_MULTI_EXECUTE_TOOL under the hood.
 */
export function createActionTools(
  actions: ResolvedAction[],
  composioExecuteTool: any,
  toolPermissions: Record<string, string>
): Record<string, any> {
  const tools: Record<string, any> = {};

  for (const action of actions) {
    const perm = toolPermissions[action.slug];
    if (perm === 'disabled') continue;

    const toolName = action.slug.toLowerCase();

    tools[toolName] = tool({
      description: `${action.displayName}: ${action.description}`.slice(0, 500),
      inputSchema: jsonSchema(action.parameters),
      needsApproval: perm === 'confirm' ? true : undefined,
      execute: async (input: any) => {
        if (composioExecuteTool?.execute) {
          return composioExecuteTool.execute({
            tools: [{ tool_slug: action.slug, arguments: input }],
          });
        }
        return { error: 'Composio execute tool not available' };
      },
    });
  }

  return tools;
}
