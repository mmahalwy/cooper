/**
 * System Skills — loaded from .agents/skills/ and auto-activated by keyword matching.
 *
 * Skills are injected into the system prompt when the user's message matches
 * their trigger keywords. No manual tool call needed.
 *
 * NOTE: This module uses 'fs' and can only be imported server-side.
 */

export interface SystemSkill {
  name: string;
  description: string;
  content: string;
  /** Keywords that trigger auto-loading this skill */
  keywords: string[];
}

/** Map skill names to trigger keywords. Skills not listed here are ignored. */
const SKILL_KEYWORDS: Record<string, string[]> = {
  'slack-messaging': ['slack', '#social', '#general', 'channel', 'send message', 'post to'],
  'slack-search': ['slack', 'find message', 'search slack', 'slack history'],
  'brainstorming': ['brainstorm', 'ideas', 'think through', 'explore options'],
  'product-brainstorming': ['product idea', 'feature idea', 'user story', 'product strategy'],
  'sql-optimization': ['sql', 'query', 'database', 'postgres', 'metabase'],
  'supabase-postgres-best-practices': ['supabase', 'postgres', 'migration', 'rls', 'row level security'],
};

let _cachedSkills: SystemSkill[] | null = null;

function parseFrontmatter(raw: string): { name: string; description: string; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { name: 'unknown', description: '', content: raw };
  }

  const frontmatter = match[1];
  const content = match[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  const descMatch = frontmatter.match(/^description:\s*["']?([\s\S]+?)["']?\s*$/m);

  return {
    name: nameMatch ? nameMatch[1].trim() : 'unknown',
    description: descMatch ? descMatch[1].trim() : '',
    content,
  };
}

/**
 * Load system skills from .agents/skills/ (only those with keyword triggers).
 */
export async function loadSystemSkills(): Promise<SystemSkill[]> {
  if (_cachedSkills) return _cachedSkills;

  try {
    const fs = await import('fs');
    const path = await import('path');

    const skillsDir = path.join(process.cwd(), '.agents', 'skills');

    if (!fs.existsSync(skillsDir)) {
      _cachedSkills = [];
      return [];
    }

    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name);

    const skills: SystemSkill[] = [];

    for (const dir of dirs) {
      const keywords = SKILL_KEYWORDS[dir];
      if (!keywords) continue; // Skip skills without keyword triggers

      const skillPath = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;

      const raw = fs.readFileSync(skillPath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      skills.push({ ...parsed, keywords });
    }

    console.log(`[skills] Loaded ${skills.length} system skills: ${skills.map((s) => s.name).join(', ')}`);
    _cachedSkills = skills;
    return skills;
  } catch (error) {
    console.error('[skills] Failed to load system skills:', error);
    _cachedSkills = [];
    return [];
  }
}

/**
 * Build skills prompt with auto-activated skills based on the user's message.
 * Returns the full content of any matching skills, plus a brief list of others.
 */
export async function buildSkillsPrompt(userMessage?: string): Promise<string> {
  const skills = await loadSystemSkills();
  if (skills.length === 0) return '';

  const messageLower = (userMessage || '').toLowerCase();

  // Find skills whose keywords match the user's message
  const activated: SystemSkill[] = [];
  const available: SystemSkill[] = [];

  for (const skill of skills) {
    const matches = skill.keywords.some((kw) => messageLower.includes(kw.toLowerCase()));
    if (matches && userMessage) {
      activated.push(skill);
    } else {
      available.push(skill);
    }
  }

  let prompt = '';

  // Inject full content of activated skills
  if (activated.length > 0) {
    prompt += '\n\n## Active Skill Guidance\n';
    prompt += 'The following skill guidance is relevant to this request. Follow it.\n';
    for (const skill of activated) {
      prompt += `\n### ${skill.name}\n${skill.content}\n`;
    }
  }

  // List other available skills briefly (so Cooper knows they exist for follow-ups)
  if (available.length > 0) {
    prompt += '\n\n## Other Available Skills\n';
    prompt += 'These skills are available if the conversation shifts to these topics:\n';
    for (const skill of available) {
      prompt += `- **${skill.name}**: ${skill.description}\n`;
    }
  }

  return prompt;
}
