import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { embedBatchMock, embedMock } = vi.hoisted(() => ({
  embedBatchMock: vi.fn<(texts: string[]) => Promise<number[][]>>(),
  embedMock: vi.fn<(text: string) => Promise<number[]>>(),
}));

vi.mock('@/modules/memory/embeddings', () => ({
  embeddingProvider: {
    embedBatch: embedBatchMock,
    embed: embedMock,
  },
}));

import {
  buildSkillsPrompt,
  loadSystemSkills,
  resetSkillsCache,
} from './index';

function writeSkill(rootDir: string, slug: string, content: string): void {
  const skillDir = path.join(rootDir, '.agents', 'skills', slug);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
}

describe('skills system', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cooper-skills-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    resetSkillsCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetSkillsCache();
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads skill files from .agents/skills and embeds their descriptions once', async () => {
    writeSkill(
      tempDir,
      'deploy-checker',
      `---
name: deploy-checker
description: Checks deploy health and rollout risk
---

# Deploy Checker

Look at deployment status and summarize risk.
`,
    );

    writeSkill(
      tempDir,
      'slack-summary',
      `---
name: slack-summary
description: Summarizes Slack discussion threads
---

# Slack Summary

Summarize Slack threads into action items.
`,
    );

    embedBatchMock.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
    ]);

    const skills = await loadSystemSkills();

    expect(skills).toHaveLength(2);
    expect(skills.map((skill) => skill.name)).toEqual([
      'deploy-checker',
      'slack-summary',
    ]);
    expect(embedBatchMock).toHaveBeenCalledTimes(1);
    expect(embedBatchMock).toHaveBeenCalledWith([
      'deploy-checker: Checks deploy health and rollout risk',
      'slack-summary: Summarizes Slack discussion threads',
    ]);
    expect(skills[0].content).toContain('# Deploy Checker');
    expect(skills[1].content).toContain('# Slack Summary');
  });

  it('injects the most relevant skill guidance into the prompt', async () => {
    writeSkill(
      tempDir,
      'github-review',
      `---
name: github-review
description: Reviews pull requests and repository changes
---

# GitHub Review

Inspect the repo, identify risks, and summarize the highest priority findings first.
`,
    );

    writeSkill(
      tempDir,
      'slack-post',
      `---
name: slack-post
description: Drafts and posts polished Slack updates
---

# Slack Post

Write a concise Slack update with clear action items.
`,
    );

    embedBatchMock.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    embedMock.mockResolvedValue([0.98, 0.02, 0]);

    const prompt = await buildSkillsPrompt(
      'Review this GitHub pull request and tell me what is risky.',
    );

    expect(prompt).toContain('## Active Skill Guidance');
    expect(prompt).toContain('### github-review');
    expect(prompt).toContain('Inspect the repo, identify risks');
    expect(prompt).not.toContain('### slack-post');
    expect(embedMock).toHaveBeenCalledWith(
      'Review this GitHub pull request and tell me what is risky.',
    );
  });

  it('does not inject skill guidance when similarity is below the threshold', async () => {
    writeSkill(
      tempDir,
      'scheduler',
      `---
name: scheduler
description: Creates and updates recurring schedules
---

# Scheduler

Create and maintain recurring task schedules.
`,
    );

    embedBatchMock.mockResolvedValue([[1, 0, 0]]);
    embedMock.mockResolvedValue([0.1, 0.2, 0]);

    const prompt = await buildSkillsPrompt('What time is it?');

    expect(prompt).toBe('');
  });

  it('serves cached skills until the cache is reset', async () => {
    writeSkill(
      tempDir,
      'first-skill',
      `---
name: first-skill
description: First version
---

First content
`,
    );

    embedBatchMock.mockResolvedValue([[1, 0, 0]]);

    const firstLoad = await loadSystemSkills();
    expect(firstLoad).toHaveLength(1);
    expect(firstLoad[0].name).toBe('first-skill');

    writeSkill(
      tempDir,
      'second-skill',
      `---
name: second-skill
description: Second version
---

Second content
`,
    );

    const cachedLoad = await loadSystemSkills();
    expect(cachedLoad).toHaveLength(1);
    expect(embedBatchMock).toHaveBeenCalledTimes(1);

    resetSkillsCache();
    embedBatchMock.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
    ]);

    const reloaded = await loadSystemSkills();
    expect(reloaded).toHaveLength(2);
    expect(reloaded.map((skill) => skill.name)).toEqual([
      'first-skill',
      'second-skill',
    ]);
  });
});
