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
 * Find the entity ID from the first active Composio connected account.
 */
async function findActiveEntityId(): Promise<string | null> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;

  const resp = await fetch('https://backend.composio.dev/api/v1/connectedAccounts?showActiveOnly=true&limit=1', {
    headers: { 'x-api-key': apiKey },
  });
  const data = await resp.json();
  const first = data.items?.[0];
  return first?.clientUniqueUserId || null;
}

/**
 * Get Composio tools for the active entity.
 */
export async function getComposioTools(
  _entityHint?: string
): Promise<Record<string, any>> {
  const cacheKey = 'composio-tools';
  const cached = sessionCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.tools;
  }

  try {
    // Find the actual entity ID from connected accounts
    const entityId = await findActiveEntityId();
    if (!entityId) {
      console.log('[composio] No active connected accounts found');
      return {};
    }

    const composio = getComposioClient();
    const session = await composio.create(entityId);
    const tools = await session.tools();

    const result = (typeof tools === 'object' && tools !== null) ? tools as Record<string, any> : {};

    sessionCache.set(cacheKey, { tools: result, createdAt: Date.now() });
    console.log(`[composio] Loaded ${Object.keys(result).length} tools for entity ${entityId.slice(0, 8)}:`, Object.keys(result));
    return result;
  } catch (error) {
    console.error(`[composio] Failed to get tools:`, error);
    sessionCache.delete(cacheKey);
    return {};
  }
}

export function clearComposioCache(): void {
  sessionCache.clear();
}
