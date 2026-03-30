import { tool } from 'ai';
import { z } from 'zod';

export interface ToolDef {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  source: 'mcp' | 'custom' | 'platform';
  connectionId: string;
}

export interface ToolRegistry {
  getToolsForOrg(orgId: string): Promise<Record<string, ReturnType<typeof tool>>>;
}

export interface McpConnectionConfig {
  url: string;
  transport: 'sse' | 'stdio';
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
}
