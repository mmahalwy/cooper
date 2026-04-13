import type { MemoryContext } from '@/modules/memory/retriever';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UIMessage } from 'ai';

export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  uiMessages: UIMessage[];
  modelOverride?: string;
  orgModelPreference?: string;
  tools?: Record<string, any>;
  memoryContext?: MemoryContext;
  supabase?: SupabaseClient;
  connectedServices?: string[];
  timezone?: string;
  onStatusUpdate?: (status: {
    message: string;
    source: 'agent' | 'integration';
    step?: number;
    toolName?: string;
  }) => void;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
