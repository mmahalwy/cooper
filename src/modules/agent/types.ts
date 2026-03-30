import type { MemoryContext } from '@/modules/memory/retriever';

export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  messages: AgentMessage[];
  modelOverride?: string;
  tools?: Record<string, any>;
  memoryContext?: MemoryContext;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
