/**
 * System Skills — loaded from .agents/skills/ and auto-activated by semantic matching.
 *
 * At load time, skill descriptions are embedded. At request time, the user's
 * message is compared against skill embeddings to find relevant ones.
 * Matching skills have their full content injected into the system prompt.
 *
 * NOTE: This module uses 'fs' and can only be imported server-side.
 */

import { embeddingProvider } from '@/modules/memory/embeddings';

export interface SystemSkill {
  name: string;
  description: string;
  content: string;
  embedding?: number[];
}

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

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Load all system skills from .agents/skills/ and embed their descriptions.
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
      const skillPath = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;

      const raw = fs.readFileSync(skillPath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (parsed.description) {
        skills.push(parsed);
      }
    }

    // Embed all descriptions in one batch
    if (skills.length > 0) {
      try {
        const descriptions = skills.map((s) => `${s.name}: ${s.description}`);
        const embeddings = await embeddingProvider.embedBatch(descriptions);
        for (let i = 0; i < skills.length; i++) {
          skills[i].embedding = embeddings[i];
        }
      } catch (err) {
        console.error('[skills] Failed to embed skill descriptions:', err);
      }
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

const SKILL_MATCH_THRESHOLD = 0.65;
const MAX_ACTIVATED_SKILLS = 1;

/**
 * Build skills prompt with auto-activated skills based on semantic similarity.
 */
export async function buildSkillsPrompt(userMessage?: string): Promise<string> {
  const skills = await loadSystemSkills();
  if (skills.length === 0) return '';

  let activated: SystemSkill[] = [];
  const available: SystemSkill[] = [];

  // Semantic matching if we have a user message and embeddings
  if (userMessage?.trim() && skills.some((s) => s.embedding)) {
    try {
      const messageEmbedding = await embeddingProvider.embed(userMessage);

      const scored = skills
        .filter((s) => s.embedding)
        .map((s) => ({
          skill: s,
          score: cosineSimilarity(messageEmbedding, s.embedding!),
        }))
        .sort((a, b) => b.score - a.score);

      for (const { skill, score } of scored) {
        if (score >= SKILL_MATCH_THRESHOLD && activated.length < MAX_ACTIVATED_SKILLS) {
          activated.push(skill);
          console.log(`[skills] Activated "${skill.name}" (score: ${score.toFixed(3)})`);
        } else {
          available.push(skill);
        }
      }
    } catch (err) {
      console.error('[skills] Failed to match skills:', err);
      available.push(...skills);
    }
  } else {
    available.push(...skills);
  }

  let prompt = '';

  if (activated.length > 0) {
    prompt += '\n\n## Active Skill Guidance\n';
    prompt += 'The following skill guidance is relevant to this request. Follow it.\n';
    for (const skill of activated) {
      prompt += `\n### ${skill.name}\n${skill.content}\n`;
    }
  }

  // Don't list all available skills — with 50+ skills, the descriptions
  // alone cost ~2K tokens. Skills activate automatically via embedding match.

  return prompt;
}
