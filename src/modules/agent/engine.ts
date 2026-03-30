import { streamText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import type { ModelMessage } from 'ai';
import type { AgentInput, AgentMessage } from './types';
import type { MemoryContext } from '@/modules/memory/retriever';

const MODELS: Record<string, string> = {
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
};

const DEFAULT_MODEL = 'gemini-flash';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate. You are helpful, concise, and action-oriented.
You help users with their work by connecting to their tools and completing tasks.
Be direct and professional. Use markdown formatting when it helps readability.
When you have tools available, use them proactively to get information or take actions.
You have web search built in — use it when the user asks about current events, recent information, or anything that benefits from live data.
Always explain what you did after using a tool. Show your reasoning when tackling complex tasks.`;

function buildSystemPrompt(memoryContext?: MemoryContext): string {
  let prompt = SYSTEM_PROMPT;

  if (memoryContext?.knowledge.length) {
    prompt += `\n\n## Things you know about this organization:\n`;
    prompt += memoryContext.knowledge.map((k) => `- ${k}`).join('\n');
  }

  if (memoryContext?.matchedSkills.length) {
    prompt += `\n\n## Relevant skills you've learned:\n`;
    for (const skill of memoryContext.matchedSkills) {
      prompt += `\n### ${skill.name}\n${skill.description}\n`;
      if (skill.steps && Array.isArray(skill.steps)) {
        prompt += `Steps:\n`;
        skill.steps.forEach((step: any, i: number) => {
          prompt += `${i + 1}. ${step.action}`;
          if (step.toolName) prompt += ` (use tool: ${step.toolName})`;
          prompt += `\n`;
        });
      }
      if (skill.outputFormat) {
        prompt += `Output format: ${skill.outputFormat}\n`;
      }
    }
  }

  return prompt;
}

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

  // Merge user-connected tools with built-in tools
  const builtInTools = {
    google_search: google.tools.googleSearch({}),
  };
  const allTools = {
    ...builtInTools,
    ...(input.tools || {}),
  };

  const result = streamText({
    model: google(modelName),
    system: buildSystemPrompt(input.memoryContext),
    messages: toModelMessages(input.messages),
    tools: allTools,
    stopWhen: stepCountIs(10),
    onError: ({ error }) => {
      console.error('[agent] Stream error:', error);
    },
  });

  return result;
}
