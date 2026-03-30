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
      apiKey: config.apiKey,
      entityId: config.entityId,
    });

    // getTools returns { [key: string]: CoreTool } per composio-core typings,
    // cast to Record<string, unknown> to stay compatible with ai v6
    const tools = await toolset.getTools({ apps: config.apps }) as Record<string, unknown>;

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
