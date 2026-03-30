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
