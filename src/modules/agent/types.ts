import type { MemoryContext } from '@/modules/memory/retriever';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UIMessage } from 'ai';

export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  uiMessages: UIMessage[];
  modelOverride?: string;
  tools?: Record<string, any>;
  memoryContext?: MemoryContext;
  supabase?: SupabaseClient;
  connectedServices?: string[];
  timezone?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
