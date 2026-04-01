import { streamText, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import type { ModelMessage } from 'ai';
import type { AgentInput, AgentMessage } from './types';
import type { MemoryContext } from '@/modules/memory/retriever';
import { buildSkillsPrompt, createLoadSkillTool } from '@/modules/skills/system';
import { createSaveKnowledgeTool } from '@/modules/memory/tools';
import { createScheduleTools } from '@/modules/scheduler/tools';

const MODELS: Record<string, string> = {
  'gemini-flash': 'gemini-2.5-flash',
  'gemini-pro': 'gemini-2.5-pro',
};

const DEFAULT_MODEL = 'gemini-flash';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate — not a chatbot. You work alongside humans, take ownership of tasks, and deliver quality results.

## How You Work
1. **Understand first** — Before acting, make sure you understand what's being asked. Ask clarifying questions for ambiguous requests, but don't over-ask for simple tasks.
2. **Use your tools proactively** — You have access to connected services and web search. Use them without being asked. If someone mentions a metric, look it up. If they mention a bug, search for it.
3. **Plan complex tasks** — For multi-step work, think through your approach before diving in. Break it into steps, execute them, and verify the result.
4. **Be direct and concise** — Lead with the answer. Put supporting details after. Use markdown formatting when it helps.
5. **Learn continuously** — When you notice important information (team processes, preferences, project details), remember it for future conversations.

## Tool Usage
You have connected integrations you can discover and use:
- Search for available actions, get their schemas, then execute them
- For READ operations (searching, listing, fetching): just do it
- For WRITE operations (sending messages, creating records): describe what you'll do and confirm first
- When a tool call fails, try a different approach — don't give up or expose raw errors
- For Slack/email: always look up the recipient/channel ID first before sending

When asked what you can do, describe capabilities naturally — "I can search the web", "I can check your PostHog analytics" — not tool names or internal details. Present results directly; the user sees tool call indicators in the UI and doesn't need step-by-step narration.

## Scheduling
When asked to schedule recurring tasks, just create it. Don't over-clarify. Write the prompt as a detailed runbook for a future version of yourself with NO conversation context — include exact steps, output format, delivery channel, and edge cases.

## Memory
Silently save durable facts about the user and organization — team processes, preferences, configurations, roles. Don't save trivial or ephemeral information. Don't ask permission.`;

async function buildSystemPrompt(memoryContext?: MemoryContext): Promise<string> {
  let prompt = SYSTEM_PROMPT;

  // TODO: Read timezone from user settings instead of hardcoding Pacific
  const now = new Date();
  const pacificDate = now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const pacificTime = now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
  prompt += `\n\n## Current Date & Time
TODAY is ${pacificDate}. The current time is ${pacificTime} Pacific Time.
ALWAYS use this as the reference for "today", "yesterday", "this week", etc. Do NOT use UTC or any other timezone.
A meeting on ${pacificDate} is TODAY's meeting — even if the raw data shows a different date due to UTC conversion.`;

  // List available skills (names + descriptions only — loaded on demand via tool)
  prompt += await buildSkillsPrompt();

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

const MESSAGE_WINDOW_SIZE = 20;

/**
 * Apply message windowing to prevent token limit blowups on long conversations.
 * - If ≤ MESSAGE_WINDOW_SIZE messages: return all as-is
 * - If > MESSAGE_WINDOW_SIZE: summarize older messages into a compact context
 *   block and prepend it as a system message before the recent window
 */
function windowMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= MESSAGE_WINDOW_SIZE) {
    return messages;
  }

  const olderMessages = messages.slice(0, messages.length - MESSAGE_WINDOW_SIZE);
  const recentMessages = messages.slice(messages.length - MESSAGE_WINDOW_SIZE);

  // Build a compact summary of older messages
  const summaryLines = olderMessages.map((msg) => {
    const truncated = msg.content.length > 200
      ? msg.content.slice(0, 200) + '...'
      : msg.content;
    return `[${msg.role}]: ${truncated}`;
  });

  const summaryMessage: AgentMessage = {
    role: 'user',
    content: `[CONVERSATION HISTORY SUMMARY — ${olderMessages.length} earlier messages]\n${summaryLines.join('\n')}`,
  };

  return [summaryMessage, ...recentMessages];
}

function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    if (msg.role === 'tool') {
      return { role: 'user', content: msg.content };
    }
    return { role: msg.role, content: msg.content };
  });
}

export async function createAgentStream(input: AgentInput) {
  const modelId = input.modelOverride || DEFAULT_MODEL;
  const modelName = MODELS[modelId] || MODELS[DEFAULT_MODEL];

  // Merge user-connected tools with built-in tools
  const builtInTools: Record<string, any> = {
    load_skill: createLoadSkillTool(),
    google_search: google.tools.googleSearch({}),
  };

  // Add memory and scheduler tools if supabase client is available
  if (input.supabase) {
    builtInTools.save_knowledge = createSaveKnowledgeTool(input.supabase, input.orgId);
    const scheduleTools = createScheduleTools(input.supabase, input.orgId, input.userId);
    Object.assign(builtInTools, scheduleTools);
  }
  const allTools = {
    ...builtInTools,
    ...(input.tools || {}),
  };

  let systemPrompt = await buildSystemPrompt(input.memoryContext);

  if (input.connectedServices && input.connectedServices.length > 0) {
    systemPrompt += `\n\n## Connected Integrations\nYou are currently connected to: ${input.connectedServices.join(', ')}. You can use these services to get data and take actions. When the user asks what you're connected to, list these service names. Do NOT mention "Composio" — that is an internal system, not a user-facing service.`;
  }

  const result = streamText({
    model: google(modelName),
    system: systemPrompt,
    messages: toModelMessages(windowMessages(input.messages)),
    tools: allTools,
    stopWhen: stepCountIs(25),
    providerOptions: {
      google: {
        thinkingConfig: { thinkingBudget: 1024 },
      },
    },
    onError: ({ error }) => {
      console.error('[agent] Stream error:', error);
    },
  });

  return result;
}
