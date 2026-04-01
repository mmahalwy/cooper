export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'member';
  model_preference: string;
  created_at: string;
}

export interface Thread {
  id: string;
  org_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: unknown[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Connection {
  id: string;
  org_id: string;
  type: 'mcp' | 'custom' | 'platform';
  name: string;
  provider: string;
  config: Record<string, unknown>;
  status: 'active' | 'inactive' | 'error';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  org_id: string;
  name: string;
  description: string;
  trigger: string;
  steps: Array<{
    action: string;
    toolName?: string;
    params?: Record<string, unknown>;
    condition?: string;
  }>;
  tools: string[];
  output_format: string | null;
  created_by: 'user' | 'cooper';
  version: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledTask {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  cron: string;
  prompt: string;
  skill_id: string | null;
  channel_config: { channel: 'web' | 'slack'; destination?: string };
  status: 'active' | 'paused';
  last_run_at: string | null;
  next_run_at: string | null;
  ends_at: string | null;
  locked_until: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

export interface ExecutionLog {
  id: string;
  task_id: string;
  thread_id: string | null;
  status: 'running' | 'success' | 'error';
  output: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  tokens_used: number | null;
  duration_ms: number | null;
}
