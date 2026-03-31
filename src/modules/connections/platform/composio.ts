import { Composio } from '@composio/core';
import type { ComposioConnectionConfig } from './types';

const cache = new Map<string, { tools: Record<string, unknown>; createdAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getComposioTools(
  connectionId: string,
  config: ComposioConnectionConfig
): Promise<Record<string, unknown>> {
  const cached = cache.get(connectionId);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.tools;
  }

  try {
    const apiKey = config.apiKey || process.env.COMPOSIO_API_KEY || '';
    const composio = new Composio({ apiKey });
    const session = await composio.create(config.entityId || 'default');

    const toolsArray = await session.tools({ toolkits: config.apps } as any);

    // Convert array to Record keyed by tool name
    const tools: Record<string, unknown> = {};
    if (Array.isArray(toolsArray)) {
      for (const t of toolsArray.slice(0, 30)) {
        const name = (t as any)?.function?.name || (t as any)?.name || `tool_${Object.keys(tools).length}`;
        tools[name] = t;
      }
    }

    cache.set(connectionId, { tools, createdAt: Date.now() });
    return tools;
  } catch (error) {
    console.error(`[composio] Failed to get tools:`, error);
    cache.delete(connectionId);
    return {};
  }
}

export function clearComposioCache(connectionId?: string): void {
  if (connectionId) {
    cache.delete(connectionId);
  } else {
    cache.clear();
  }
}
