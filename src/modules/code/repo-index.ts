/**
 * Light codebase index — file tree + tech stack detection, cached in workspace notes.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getRepoTree, getFileContent } from './github';
import { saveNote, readNote } from '@/modules/workspace/db';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'vendor',
  '__pycache__', '.venv', 'venv', '.cache', 'coverage', '.turbo',
]);

const CONFIG_FILES = [
  'README.md', 'package.json', 'pyproject.toml', 'Cargo.toml',
  'go.mod', 'Makefile', 'tsconfig.json', 'docker-compose.yml',
];

export interface RepoIndex {
  owner: string;
  repo: string;
  tree: string;
  techStack: TechStack;
  indexedAt: string;
}

export interface TechStack {
  language: string;
  framework: string | null;
  testCommand: string | null;
  packageManager: string | null;
}

async function buildTree(
  token: string,
  owner: string,
  repo: string,
  path: string = '',
  depth: number = 0,
  maxDepth: number = 4
): Promise<string> {
  if (depth > maxDepth) return '';

  const items = await getRepoTree(token, owner, repo, path);
  let tree = '';
  const indent = '  '.repeat(depth);

  for (const item of items) {
    if (IGNORE_DIRS.has(item.name)) continue;

    if (item.type === 'dir') {
      tree += `${indent}${item.name}/\n`;
      tree += await buildTree(token, owner, repo, item.path, depth + 1, maxDepth);
    } else {
      tree += `${indent}${item.name}\n`;
    }
  }

  return tree;
}

export function detectTechStack(configs: Record<string, string>): TechStack {
  const stack: TechStack = {
    language: 'unknown',
    framework: null,
    testCommand: null,
    packageManager: null,
  };

  const pkg = configs['package.json'];
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      stack.language = 'TypeScript/JavaScript';
      stack.testCommand = parsed.scripts?.test || null;
      stack.packageManager = configs['pnpm-lock.yaml'] ? 'pnpm'
        : configs['yarn.lock'] ? 'yarn' : 'npm';

      const deps = { ...parsed.dependencies, ...parsed.devDependencies };
      if (deps['next']) stack.framework = 'Next.js';
      else if (deps['express']) stack.framework = 'Express';
      else if (deps['react']) stack.framework = 'React';
      else if (deps['vue']) stack.framework = 'Vue';
      else if (deps['svelte'] || deps['@sveltejs/kit']) stack.framework = 'SvelteKit';
    } catch { /* invalid json */ }
  }

  if (configs['pyproject.toml']) {
    stack.language = 'Python';
    const toml = configs['pyproject.toml'];
    if (toml.includes('django')) stack.framework = 'Django';
    else if (toml.includes('fastapi')) stack.framework = 'FastAPI';
    else if (toml.includes('flask')) stack.framework = 'Flask';
    stack.testCommand = 'pytest';
    stack.packageManager = toml.includes('[tool.poetry]') ? 'poetry' : 'pip';
  }

  if (configs['Cargo.toml']) {
    stack.language = 'Rust';
    stack.testCommand = 'cargo test';
    stack.packageManager = 'cargo';
  }

  if (configs['go.mod']) {
    stack.language = 'Go';
    stack.testCommand = 'go test ./...';
    stack.packageManager = 'go modules';
  }

  return stack;
}

export async function getOrCreateRepoIndex(
  supabase: SupabaseClient,
  orgId: string,
  token: string,
  owner: string,
  repo: string
): Promise<RepoIndex> {
  const noteKey = `repo:${owner}/${repo}`;

  const cached = await readNote(supabase, orgId, noteKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached.content);
      const age = Date.now() - new Date(parsed.indexedAt).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        return parsed as RepoIndex;
      }
    } catch { /* stale or invalid cache, rebuild */ }
  }

  console.log(`[code] Building index for ${owner}/${repo}`);
  const tree = await buildTree(token, owner, repo);

  const configs: Record<string, string> = {};
  const rootItems = await getRepoTree(token, owner, repo);
  for (const item of rootItems) {
    if (CONFIG_FILES.includes(item.name) && item.type === 'file') {
      try {
        const { content } = await getFileContent(token, owner, repo, item.path);
        const raw = content.split('\n').map(l => l.replace(/^\s*\d+\s*\|\s?/, '')).join('\n');
        configs[item.name] = raw;
      } catch { /* skip unreadable files */ }
    }
  }

  const techStack = detectTechStack(configs);
  const index: RepoIndex = {
    owner,
    repo,
    tree,
    techStack,
    indexedAt: new Date().toISOString(),
  };

  await saveNote(supabase, orgId, noteKey, JSON.stringify(index));
  console.log(`[code] Indexed ${owner}/${repo}: ${techStack.language}, ${techStack.framework || 'no framework'}`);

  return index;
}
