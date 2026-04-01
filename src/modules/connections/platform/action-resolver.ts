import { tool } from 'ai';
import { z } from 'zod';

export interface ResolvedAction {
  slug: string;
  displayName: string;
  description: string;
  parameters: Record<string, { type: string; description?: string; required?: boolean }>;
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
      parameters: extractParameters(item.parameters),
    }));
  } catch (error) {
    console.error(`[action-resolver] Failed to fetch actions for ${appName}:`, error);
    return [];
  }
}

function extractParameters(params: any): Record<string, { type: string; description?: string; required?: boolean }> {
  if (!params?.properties) return {};
  const result: Record<string, { type: string; description?: string; required?: boolean }> = {};
  const required = new Set(params.required || []);

  for (const [key, val] of Object.entries(params.properties as Record<string, any>)) {
    result[key] = {
      type: val.type || 'string',
      description: val.description,
      required: required.has(key),
    };
  }
  return result;
}

/**
 * Build a Zod schema from resolved action parameters.
 */
function buildZodSchema(parameters: ResolvedAction['parameters']): z.ZodType {
  const shape: Record<string, z.ZodType> = {};

  for (const [key, param] of Object.entries(parameters)) {
    let field: z.ZodType;
    switch (param.type) {
      case 'number':
      case 'integer':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array':
        field = z.array(z.unknown());
        break;
      case 'object':
        field = z.record(z.string(), z.unknown());
        break;
      default:
        field = z.string();
    }

    if (param.description) {
      field = field.describe(param.description);
    }
    if (!param.required) {
      field = field.optional() as any;
    }
    shape[key] = field;
  }

  return z.object(shape);
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
      inputSchema: buildZodSchema(action.parameters) as any,
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
