export interface McpServerConfig {
  url: string;
  transport: 'sse';
  headers?: Record<string, string>;
}
