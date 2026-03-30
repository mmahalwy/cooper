import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { McpServerConfig } from './types';

type McpToolSet = Awaited<ReturnType<MCPClient['tools']>>;

// Cache MCP clients by connection ID to avoid reconnecting on every request
const clientCache = new Map<string, { client: MCPClient; createdAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedClient(connectionId: string): MCPClient | null {
  const entry = clientCache.get(connectionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    clientCache.delete(connectionId);
    return null;
  }
  return entry.client;
}

export async function getMcpTools(
  connectionId: string,
  config: McpServerConfig,
): Promise<McpToolSet> {
  let client = getCachedClient(connectionId);

  if (!client) {
    client = await createMCPClient({
      transport: {
        type: 'sse',
        url: config.url,
        headers: config.headers,
      },
    });
    clientCache.set(connectionId, { client, createdAt: Date.now() });
  }

  try {
    const tools = await client.tools();
    return tools;
  } catch (error) {
    console.error(`[mcp] Failed to get tools from ${config.url}:`, error);
    clientCache.delete(connectionId);
    return {};
  }
}

export function clearMcpClientCache(connectionId?: string): void {
  if (connectionId) {
    clientCache.delete(connectionId);
  } else {
    clientCache.clear();
  }
}
