import type { MemoryContext } from '@/modules/memory/retriever';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  messages: AgentMessage[];
  modelOverride?: string;
  tools?: Record<string, any>;
  memoryContext?: MemoryContext;
  supabase?: SupabaseClient;
  connectedServices?: string[];
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
