import { VercelAIToolSet } from 'composio-core';
import type { ComposioConnectionConfig } from './types';

// Cache by connection ID
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
    const toolset = new VercelAIToolSet({
      apiKey: config.apiKey || process.env.COMPOSIO_API_KEY || '',
      entityId: config.entityId || 'default',
    });

    // Fetch important tools first (curated subset), fall back to all if none
    let tools = await toolset.getTools({ apps: config.apps, tags: ['important'] }) as Record<string, unknown>;
    if (Object.keys(tools).length === 0) {
      // No important-tagged tools — get all but limit to avoid context overflow
      const allTools = await toolset.getTools({ apps: config.apps }) as Record<string, unknown>;
      const entries = Object.entries(allTools).slice(0, 30);
      tools = Object.fromEntries(entries);
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
