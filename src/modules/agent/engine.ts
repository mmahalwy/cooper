import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { ModelMessage } from 'ai';
import type { AgentInput, AgentMessage } from './types';

const MODELS: Record<string, string> = {
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-opus': 'claude-opus-4-20250514',
};

const DEFAULT_MODEL = 'claude-sonnet';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate. You are helpful, concise, and action-oriented.
You help users with their work by connecting to their tools and completing tasks.
Be direct and professional. Use markdown formatting when it helps readability.`;

function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    if (msg.role === 'tool') {
      // Tool messages in ModelMessage format require tool result parts
      // For now, surface tool messages as user messages with context
      return { role: 'user', content: msg.content };
    }
    return { role: msg.role, content: msg.content };
  });
}

export function createAgentStream(input: AgentInput) {
  const modelId = input.modelOverride || DEFAULT_MODEL;
  const modelName = MODELS[modelId] || MODELS[DEFAULT_MODEL];

  const result = streamText({
    model: anthropic(modelName),
    system: SYSTEM_PROMPT,
    messages: toModelMessages(input.messages),
    onError: ({ error }) => {
      console.error('[agent] Stream error:', error);
    },
  });

  return result;
}
