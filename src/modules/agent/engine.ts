import { streamText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import type { ModelMessage } from 'ai';
import type { AgentInput, AgentMessage } from './types';

const MODELS: Record<string, string> = {
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
};

const DEFAULT_MODEL = 'gemini-flash';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate. You are helpful, concise, and action-oriented.
You help users with their work by connecting to their tools and completing tasks.
Be direct and professional. Use markdown formatting when it helps readability.
When you have tools available, use them proactively to get information or take actions.
Always explain what you did after using a tool.`;

function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    if (msg.role === 'tool') {
      return { role: 'user', content: msg.content };
    }
    return { role: msg.role, content: msg.content };
  });
}

export function createAgentStream(input: AgentInput) {
  const modelId = input.modelOverride || DEFAULT_MODEL;
  const modelName = MODELS[modelId] || MODELS[DEFAULT_MODEL];

  const hasTools = input.tools && Object.keys(input.tools).length > 0;

  const result = streamText({
    model: google(modelName),
    system: SYSTEM_PROMPT,
    messages: toModelMessages(input.messages),
    ...(hasTools ? {
      tools: input.tools,
      stopWhen: stepCountIs(10),
    } : {}),
    onError: ({ error }) => {
      console.error('[agent] Stream error:', error);
    },
  });

  return result;
}
