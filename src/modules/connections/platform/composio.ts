import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

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

const sessionCache = new Map<string, { tools: Record<string, any>; createdAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — tools rarely change

/**
 * Get Composio tools for the given entity.
 */
export async function getComposioToolsForEntity(
  entityId: string
): Promise<Record<string, any>> {
  const cacheKey = `composio-tools:${entityId}`;
  const cached = sessionCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.tools;
  }

  try {
    const composio = getComposioClient();
    const session = await composio.create(entityId);
    const tools = await session.tools();

    const result = (typeof tools === 'object' && tools !== null) ? tools as Record<string, any> : {};

    sessionCache.set(cacheKey, { tools: result, createdAt: Date.now() });
    console.log(`[composio] Loaded ${Object.keys(result).length} tools for entity ${entityId.slice(0, 8)}:`, Object.keys(result));
    return result;
  } catch (error) {
    console.error(`[composio] Failed to get tools for entity ${entityId}:`, error);
    sessionCache.delete(cacheKey);
    return {};
  }
}

export function clearComposioCache(): void {
  sessionCache.clear();
}
