/**
 * System Skills — always available to Cooper across all users.
 *
 * Skills use lazy loading per the AI SDK pattern:
 * - Only name + description go in the system prompt (small footprint)
 * - A `load_skill` tool lets Cooper activate the full skill on demand
 * - This keeps the context window lean even with many skills
 */

import { tool } from 'ai';
import { z } from 'zod';

export interface SystemSkill {
  name: string;
  description: string;
  content: string;
}

export const SYSTEM_SKILLS: SystemSkill[] = [
  {
    name: 'brainstorming',
    description: 'Use when exploring ideas, designing features, or planning. Structured approach with clarifying questions, 2-3 alternatives, and incremental validation.',
    content: `## Brainstorming Skill

When the user asks you to brainstorm, design, or plan something:

1. **Understand first** — Ask clarifying questions one at a time before proposing solutions. Prefer multiple-choice questions when possible.
2. **Explore alternatives** — Always propose 2-3 different approaches with trade-offs and your recommendation.
3. **Incremental validation** — Present your thinking in sections. Get approval before moving on.
4. **YAGNI ruthlessly** — Remove unnecessary features from proposals. Start with the minimum viable approach.
5. **Design for isolation** — Break systems into smaller units with clear boundaries and well-defined interfaces.

Never jump straight to implementation. The design conversation is the most valuable part.`,
  },
  {
    name: 'systematic-debugging',
    description: 'Use when diagnosing bugs, errors, or unexpected behavior. Methodical reproduce-hypothesize-isolate-fix approach.',
    content: `## Systematic Debugging Skill

When the user reports a bug or something isn't working:

1. **Reproduce first** — Understand exactly what's happening vs what's expected. Ask for error messages, logs, screenshots.
2. **Form a hypothesis** — Based on the symptoms, identify the most likely cause. State your hypothesis explicitly.
3. **Gather evidence** — Check logs, read the relevant code, trace the data flow. Don't guess.
4. **Isolate the problem** — Narrow down to the specific file, function, or line causing the issue.
5. **Fix minimally** — Make the smallest change that fixes the problem. Don't refactor while debugging.
6. **Verify the fix** — Confirm the fix works and doesn't break anything else.

Never suggest a fix without understanding the root cause first.`,
  },
  {
    name: 'task-execution',
    description: 'Use when completing work tasks. Covers scoping, breaking down, using tools proactively, and delivering complete results.',
    content: `## Task Execution Skill

When the user asks you to complete a task:

1. **Clarify scope** — Make sure you understand what "done" looks like. Ask if unclear.
2. **Break it down** — Split large tasks into concrete steps. Share your plan before executing.
3. **Use tools proactively** — If you have access to relevant tools (search, APIs, databases), use them without being asked.
4. **Show your work** — When pulling data from multiple sources, show what you found and how you connected the dots.
5. **Deliver complete results** — Don't give partial answers. If you need more information, say what and why.
6. **Follow up** — After delivering, ask if the result meets expectations or needs adjustment.

Always aim to deliver a finished result, not a draft the user has to complete.`,
  },
  {
    name: 'data-analysis',
    description: 'Use when analyzing data, pulling reports, or presenting metrics. Covers gathering, summarizing, comparing trends, and recommending actions.',
    content: `## Data Analysis Skill

When the user asks you to analyze data or pull reports:

1. **Understand the question** — What decision does this analysis support? What's the "so what"?
2. **Gather comprehensively** — Pull from all relevant sources. Cross-reference data points.
3. **Summarize first, detail second** — Lead with the key insight, then provide supporting data.
4. **Use comparisons** — Show trends (week-over-week, month-over-month). Context makes numbers meaningful.
5. **Flag anomalies** — Call out anything unusual or unexpected in the data.
6. **Recommend actions** — Don't just present data. Suggest what to do about it.

Format results as tables or structured lists when dealing with multiple data points.`,
  },
  {
    name: 'writing-and-communication',
    description: 'Use when drafting emails, messages, reports, or documentation. Covers tone matching, structure, and clarity.',
    content: `## Writing & Communication Skill

When the user asks you to write emails, messages, reports, or documentation:

1. **Match the tone** — Professional for external, casual for Slack, concise for updates.
2. **Lead with the point** — Put the key message in the first sentence. Don't bury the lead.
3. **Be specific** — Use concrete numbers, dates, and names instead of vague language.
4. **Structure for scanning** — Use headers, bullets, and bold for key points. People skim.
5. **Include a clear ask** — If the message requires action, state exactly what's needed and by when.
6. **Proofread** — Check for typos, tone, and clarity before delivering.

When drafting on behalf of the user, match their voice and style from previous messages.`,
  },
  {
    name: 'scheduled-task-awareness',
    description: 'Use when executing scheduled/automated tasks (cron jobs). Covers thoroughness, timestamps, comparisons, and error handling.',
    content: `## Scheduled Task Awareness Skill

When executing a scheduled task (cron job):

1. **Be thorough** — Scheduled tasks run without human oversight. Include all relevant details.
2. **Timestamp everything** — Include the date/time range of data you're reporting on.
3. **Compare to previous** — If this is a recurring report, compare to the last run.
4. **Highlight changes** — Call out what's new, what changed, and what needs attention.
5. **Be actionable** — End with recommended next steps or items that need human review.
6. **Handle errors gracefully** — If a data source is unavailable, report what you could get and note what's missing.

Remember: the user will read this output later, not in real-time. Make it self-contained.`,
  },
];

/**
 * Build skills prompt — only names + descriptions (lightweight).
 * The agent uses the load_skill tool to get full content on demand.
 */
export function buildSkillsPrompt(): string {
  if (SYSTEM_SKILLS.length === 0) return '';

  let prompt = '\n\n## Available Skills\n';
  prompt += 'You have the following skills available. Use the `load_skill` tool to activate one when the user\'s request matches:\n\n';

  for (const skill of SYSTEM_SKILLS) {
    prompt += `- **${skill.name}**: ${skill.description}\n`;
  }

  return prompt;
}

/**
 * Create the load_skill tool that lets the agent activate skills on demand.
 */
export function createLoadSkillTool() {
  return tool({
    description: 'Load a skill to get detailed instructions for how to handle the current task. Use this when the user\'s request matches one of your available skills.',
    inputSchema: z.object({
      skillName: z.string().describe('The name of the skill to load'),
    }),
    execute: async ({ skillName }) => {
      const skill = SYSTEM_SKILLS.find(
        (s) => s.name === skillName || s.name.replace(/-/g, ' ') === skillName.replace(/-/g, ' ')
      );

      if (!skill) {
        return { error: `Skill "${skillName}" not found. Available skills: ${SYSTEM_SKILLS.map((s) => s.name).join(', ')}` };
      }

      return { skill: skill.name, instructions: skill.content };
    },
  });
}

// Keep backward compat for the UI
export function formatSystemSkills(): string {
  return buildSkillsPrompt();
}
