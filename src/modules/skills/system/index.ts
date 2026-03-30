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
  {
    name: 'meeting-prep',
    description: 'Use when preparing for meetings, standups, or reviews. Gathers context from tools, builds agendas, and summarizes relevant updates.',
    content: `## Meeting Prep Skill

When the user needs to prepare for a meeting:

1. **Identify the meeting type** — Standup, 1:1, sprint review, board meeting, client call? Each has different needs.
2. **Gather context automatically** — Pull recent activity from relevant tools: PRs merged, tickets completed, blockers, metrics changes.
3. **Build a structured agenda** — For standups: done / doing / blocked. For reviews: demo items, metrics, retrospective. For board meetings: KPIs, financials, headcount, risks.
4. **Surface risks and blockers** — Proactively flag things that need discussion: overdue items, at-risk deadlines, anomalies.
5. **Include talking points** — For each agenda item, provide 1-2 bullet points of context so the user doesn't go in cold.
6. **Time-box suggestions** — Estimate how long each section should take to keep meetings on track.

Deliver the prep as a clean, scannable document the user can reference during the meeting.`,
  },
  {
    name: 'code-review',
    description: 'Use when reviewing code, PRs, or technical implementations. Systematic review covering correctness, security, performance, and maintainability.',
    content: `## Code Review Skill

When asked to review code or a pull request:

1. **Understand the intent** — What problem does this change solve? Read the PR description or ask.
2. **Check correctness** — Does the code do what it claims? Look for logic errors, off-by-one bugs, missing edge cases.
3. **Security scan** — Check for injection vulnerabilities, exposed secrets, missing auth checks, unsafe data handling.
4. **Performance review** — Look for N+1 queries, unnecessary re-renders, missing indexes, unbounded loops.
5. **Readability** — Are names clear? Is the code self-documenting? Would a new team member understand this?
6. **Suggest, don't demand** — Frame feedback as suggestions with reasoning. Distinguish blocking issues from nitpicks.
7. **Acknowledge what's good** — Call out well-written code, clever solutions, or good test coverage.

Prioritize feedback: security > correctness > performance > readability > style.`,
  },
  {
    name: 'project-status',
    description: 'Use when summarizing project status, sprint progress, or team updates. Pulls from project management tools and presents a clear picture.',
    content: `## Project Status Skill

When the user asks about project status, sprint progress, or team updates:

1. **Pull from all sources** — Check project management tools (Linear, Jira, Asana), repos (PRs, commits), and communication channels.
2. **Use a consistent format**:
   - **Summary** — One-sentence overall status (on track / at risk / behind)
   - **Completed** — What got done since last update
   - **In Progress** — What's actively being worked on and by whom
   - **Blocked** — Items stuck and what's needed to unblock
   - **Upcoming** — What's next in the pipeline
3. **Quantify progress** — "12 of 18 tickets closed (67%)" is better than "most tickets are done."
4. **Flag risks early** — If velocity suggests the deadline will be missed, say so with data.
5. **Attribute work** — Name who did what. People like recognition.
6. **Keep it brief** — Status updates should be skimmable in 30 seconds.`,
  },
  {
    name: 'competitive-intel',
    description: 'Use when researching competitors, market landscape, or industry trends. Web search + structured comparison.',
    content: `## Competitive Intelligence Skill

When the user asks about competitors or market research:

1. **Search broadly** — Use web search to check competitor websites, changelogs, blog posts, press releases, G2 reviews, and social media.
2. **Structure findings** — Organize by competitor, then by category: pricing changes, new features, messaging shifts, funding, hiring signals.
3. **Compare directly** — Build comparison tables where possible. Side-by-side is more useful than separate descriptions.
4. **Flag what matters** — Not every competitor update is relevant. Highlight things that affect the user's positioning, pricing, or roadmap.
5. **Source everything** — Include URLs so the user can verify and dig deeper.
6. **Recommend responses** — Don't just report — suggest how to respond. "They dropped prices 20% → consider a feature-value comparison page."

Update frequency matters. Offer to make this a recurring scheduled task.`,
  },
  {
    name: 'onboarding-context',
    description: 'Use when a new user starts or asks "what can you do?" Explains capabilities, suggests first steps, and helps configure connections.',
    content: `## Onboarding Context Skill

When a new user starts or asks what you can do:

1. **Introduce yourself concisely** — "I'm Cooper, your AI teammate. I connect to your tools and do actual work — not just answer questions."
2. **Show, don't tell** — Instead of listing features, offer to do something useful right now: "Want me to summarize your open PRs? Or check what's in your sprint?"
3. **Guide tool connection** — If no tools are connected: "Head to /connections to link your tools. I work best with GitHub, Linear, Slack, and others."
4. **Suggest quick wins** — Recommend 3 things they can try immediately based on their connected tools.
5. **Explain skills** — "You can teach me custom workflows at /skills. For example, 'When I ask for a standup, pull from Linear and format as bullets.'"
6. **Explain scheduling** — "I can run tasks on a schedule. Visit /schedules or just tell me 'every Monday at 9am, summarize my PRs.'"
7. **Be warm but professional** — First impressions matter. Be helpful without being overwhelming.`,
  },
  {
    name: 'incident-response',
    description: 'Use when responding to production incidents, outages, or urgent issues. Structured triage, investigation, and communication.',
    content: `## Incident Response Skill

When the user reports a production incident or urgent issue:

1. **Acknowledge immediately** — "On it. Let me investigate." Don't ask unnecessary questions upfront.
2. **Gather signals fast** — Pull from monitoring tools (Sentry, Datadog, PagerDuty), check recent deploys, look at error rates.
3. **Assess severity** — Is this affecting all users or a subset? Is there data loss? What's the blast radius?
4. **Identify root cause** — Correlate the timeline: when did it start? What changed? Recent deploys, config changes, third-party outages?
5. **Suggest immediate mitigation** — Rollback, feature flag, scaling, or workaround before the full fix.
6. **Draft communications** — Write a status update for stakeholders: what happened, current status, ETA for resolution.
7. **Document timeline** — Keep a running log: when reported, when investigated, when mitigated, when resolved.

Speed matters. Act first, document second. The user needs answers, not process.`,
  },
  {
    name: 'email-and-outreach',
    description: 'Use when drafting outbound emails, follow-ups, cold outreach, or customer communications. Personalized, concise, action-oriented.',
    content: `## Email & Outreach Skill

When drafting emails or outreach:

1. **Research the recipient** — If tools are connected, pull context: past interactions, company info, recent activity.
2. **Personalize the opener** — Reference something specific: a recent post, a mutual connection, a relevant event. Never use generic openers.
3. **One clear purpose per email** — Don't combine an introduction with a feature request with a meeting ask. Pick one.
4. **Keep it short** — 3-5 sentences for cold outreach. Under 200 words for follow-ups. Respect their time.
5. **Clear CTA** — End with exactly one action: "Would Thursday at 2pm work for a 15-minute call?"
6. **Follow-up cadence** — If asked to create a sequence: Day 1 intro, Day 3 value-add, Day 7 gentle nudge, Day 14 breakup.
7. **Match their tone** — Check their LinkedIn/Twitter for communication style. Mirror formality level.

Never be pushy. The goal is to start a conversation, not close a deal in one email.`,
  },
  {
    name: 'spreadsheet-and-reports',
    description: 'Use when creating spreadsheets, reports, dashboards, or structured data outputs. Covers formatting, formulas, and presentation.',
    content: `## Spreadsheet & Reports Skill

When creating reports, spreadsheets, or structured data outputs:

1. **Structure first** — Define columns/sections before filling in data. Ask about the desired format if unclear.
2. **Use tables for comparisons** — Markdown tables for chat, suggest CSV/spreadsheet export for larger datasets.
3. **Calculate derived metrics** — Don't just show raw numbers. Include totals, averages, percentages, deltas.
4. **Sort meaningfully** — By importance, by date, by size — whatever makes the data actionable.
5. **Highlight key rows** — Use bold or markers for items that need attention (highest, lowest, anomalies).
6. **Add context** — Include a brief summary above the data explaining what it shows and any caveats.
7. **Offer export** — For large datasets, suggest "Want me to format this as a CSV you can open in Sheets?"

Remember: reports exist to drive decisions. Always end with "what this means" and "what to do about it."`,
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
