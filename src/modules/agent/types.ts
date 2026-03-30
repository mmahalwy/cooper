export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  messages: AgentMessage[];
  modelOverride?: string;
  tools?: Record<string, any>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
