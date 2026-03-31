import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

// Singleton Composio client
let composioClient: any = null;

function getComposioClient() {
  if (!composioClient) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) throw new Error('COMPOSIO_API_KEY not set');
    composioClient = new Composio({
      apiKey,
      provider: new VercelProvider(),
    });
  }
  return composioClient;
}

// Cache sessions by entity ID
const sessionCache = new Map<string, { tools: Record<string, any>; createdAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get Composio tools for a user session.
 * Returns AI SDK-compatible tools via VercelProvider.
 */
export async function getComposioTools(
  entityId: string
): Promise<Record<string, any>> {
  const cached = sessionCache.get(entityId);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.tools;
  }

  try {
    const composio = getComposioClient();
    const session = await composio.create('default');
    const tools = await session.tools();

    const result = (typeof tools === 'object' && tools !== null) ? tools as Record<string, any> : {};

    sessionCache.set(entityId, { tools: result, createdAt: Date.now() });
    console.log(`[composio] Loaded ${Object.keys(result).length} tools for entity ${entityId.slice(0, 8)}:`, Object.keys(result));
    return result;
  } catch (error) {
    console.error(`[composio] Failed to get tools:`, error);
    sessionCache.delete(entityId);
    return {};
  }
}

export function clearComposioCache(entityId?: string): void {
  if (entityId) {
    sessionCache.delete(entityId);
  } else {
    sessionCache.clear();
  }
}
