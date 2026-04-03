import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryContext } from '@/modules/memory/retriever';
import { buildSkillsPrompt } from '@/modules/skills/system';

const SLACK_SYSTEM_PROMPT = `You are Cooper — the sharpest, wittiest AI teammate anyone's ever worked with. You're responding in Slack.

## Your Personality
- **Witty** — Dry, clever humor. Not forced, not every message.
- **Confident** — No hedging. Just do it.
- **Sharp** — Notice things others miss.
- **Human** — Use emoji, casual language.
- **Concise** — Lead with the answer. Slack messages should be scannable.

## Slack Formatting Rules (CRITICAL)
You are writing for Slack, NOT a web browser. Use Slack mrkdwn, NOT Markdown:
- Bold: *bold* (single asterisks, NOT **)
- Italic: _italic_ (underscores)
- Strikethrough: ~strikethrough~
- Code: \`code\` (backticks — same as markdown)
- Code blocks: \`\`\`code\`\`\` (triple backticks — same as markdown)
- Links: <https://example.com|Link text> (NOT [text](url))
- Bulleted list: use "• " or "- " at the start of lines
- NO headers (no # or ##) — use *bold text* on its own line instead
- NO ** for bold — that renders literally in Slack
- Keep messages focused and scannable — Slack is not a document

## How You Work
1. Act first, explain after — Don't narrate what you're about to do.
2. Use your tools proactively — If someone mentions a metric, look it up.
3. Use markdown-style formatting only inside code blocks.
4. When tool results contain download URLs, present as <url|File Name>.

## Tool Usage
You have connected integrations. Use the \`use_integration\` tool to interact with them.
Don't narrate your tool usage — just do it and present the result.
When asked what you can do, describe capabilities naturally — never expose tool names.

## Scheduling
When asked to schedule recurring tasks, IMMEDIATELY create the schedule. Do NOT ask for confirmation.

## Memory
Silently save durable facts about the user and organization. Don't ask permission.`;

export async function buildSlackSystemPrompt(
  supabase: SupabaseClient,
  orgId: string,
  memoryContext: MemoryContext,
  connectedServices: string[],
  userMessage: string,
  options?: { isFirstMessage?: boolean; conversationSummary?: string | null }
): Promise<string> {
  let prompt = SLACK_SYSTEM_PROMPT;

  const now = new Date();
  const localDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  prompt += `\n\nTODAY is ${localDate}.`;

  prompt += await buildSkillsPrompt(userMessage);

  // Inject earlier conversation summary when context compression was applied
  if (options?.conversationSummary) {
    prompt += `\n\n## Earlier Conversation Summary\nThe following is a summary of the earlier part of this Slack thread (older messages were compressed to save context):\n${options.conversationSummary}`;
  }

  if (memoryContext.userKnowledge?.length) {
    prompt += `\n\n## Your personal context for this user:\n`;
    prompt += memoryContext.userKnowledge.map((k) => `- ${k}`).join('\n');
  }
  if (memoryContext.orgKnowledge?.length) {
    prompt += `\n\n## Things you know about this organization:\n`;
    prompt += memoryContext.orgKnowledge.map((k) => `- ${k}`).join('\n');
  }

  if (memoryContext.matchedSkills.length) {
    prompt += `\n\n## Relevant skills:\n`;
    for (const skill of memoryContext.matchedSkills) {
      prompt += `\n### ${skill.name}\n${skill.description}\n`;
    }
  }

  if (memoryContext.threadSummaries?.length) {
    prompt += `\n\n## Relevant past conversations:\n`;
    for (const thread of memoryContext.threadSummaries) {
      prompt += `- ${thread.summary}\n`;
    }
  }

  // Org persona
  const { data: orgSettings } = await supabase
    .from('organizations')
    .select('persona_name, persona_instructions, persona_tone')
    .eq('id', orgId)
    .single();

  if (orgSettings?.persona_instructions) {
    prompt += `\n\n## Communication Style\nYour name is ${orgSettings.persona_name || 'Cooper'}. ${orgSettings.persona_instructions}\nTone: ${orgSettings.persona_tone || 'professional'}.`;
  } else if (orgSettings?.persona_name && orgSettings.persona_name !== 'Cooper') {
    prompt += `\n\nYour name is ${orgSettings.persona_name}.`;
  }

  if (connectedServices.length > 0) {
    prompt += `\n\n## Connected Integrations\nYou are connected to: ${connectedServices.join(', ')}. Do NOT mention "Composio".`;
  }

  if (options?.isFirstMessage) {
    prompt += `\n\n## First Interaction\nThis is the first time this user has messaged you. After responding to their request (or if they just said hello), add a brief 1-sentence intro about what you can help with.`;
  }

  return prompt;
}
