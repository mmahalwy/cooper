/**
 * System Skills — loaded dynamically from .agents/skills/ directory.
 *
 * Skills use lazy loading per the AI SDK pattern:
 * - Only name + description go in the system prompt
 * - A `load_skill` tool lets Cooper activate the full skill on demand
 *
 * NOTE: This module uses 'fs' and can only be imported server-side.
 * For client components, use the /api/skills/system endpoint.
 */

import { tool } from 'ai';
import { z } from 'zod';

export interface SystemSkill {
  name: string;
  description: string;
  content: string;
}

let _cachedSkills: SystemSkill[] | null = null;

/**
 * Parse YAML frontmatter from a SKILL.md file.
 */
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
 * Load all system skills from .agents/skills/
 * Uses dynamic import for 'fs' to avoid client-side bundling issues.
 */
export async function loadSystemSkills(): Promise<SystemSkill[]> {
  if (_cachedSkills) return _cachedSkills;

  try {
    const fs = await import('fs');
    const path = await import('path');

    const skillsDir = path.join(process.cwd(), '.agents', 'skills');

    if (!fs.existsSync(skillsDir)) {
      console.warn('[skills] .agents/skills/ directory not found');
      _cachedSkills = [];
      return [];
    }

    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((d: any) => d.isDirectory())
      .map((d: any) => d.name);

    const skills: SystemSkill[] = [];

    for (const dir of dirs) {
      const skillPath = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;

      const raw = fs.readFileSync(skillPath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      skills.push(parsed);
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
 * Build skills prompt — only names + descriptions.
 */
export async function buildSkillsPrompt(): Promise<string> {
  const skills = await loadSystemSkills();
  if (skills.length === 0) return '';

  let prompt = '\n\n## Available Skills\n';
  prompt += 'You have the following skills available. Use the `load_skill` tool to activate one when the user\'s request matches:\n\n';

  for (const skill of skills) {
    prompt += `- **${skill.name}**: ${skill.description}\n`;
  }

  return prompt;
}

/**
 * Create the load_skill tool — lets Cooper activate skills on demand.
 */
export function createLoadSkillTool() {
  return tool({
    description: 'Load a skill to get detailed instructions for how to handle the current task. Use this when the user\'s request matches one of your available skills.',
    inputSchema: z.object({
      skillName: z.string().describe('The name of the skill to load'),
    }),
    execute: async ({ skillName }) => {
      const skills = await loadSystemSkills();
      const skill = skills.find(
        (s) => s.name === skillName ||
          s.name.replace(/-/g, ' ') === skillName.replace(/-/g, ' ') ||
          s.name.toLowerCase() === skillName.toLowerCase()
      );

      if (!skill) {
        return {
          error: `Skill "${skillName}" not found. Available skills: ${skills.map((s) => s.name).join(', ')}`,
        };
      }

      return { skill: skill.name, instructions: skill.content };
    },
  });
}
