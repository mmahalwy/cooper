# Cooper Code Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Cooper the ability to investigate codebases, make code changes, run tests, and create pull requests — all through GitHub API and E2B sandbox.

**Architecture:** Investigation via GitHub API (fast, no sandbox). Development via E2B sandbox (clone, edit, test, push). Repo index cached in workspace notes. Auth via existing Composio GitHub OAuth.

**Tech Stack:** GitHub REST API, E2B sandbox, Composio connected accounts API, AI SDK tools, existing workspace notes

---

### Task 1: GitHub API Helpers

**Files:**
- Create: `src/modules/code/github.ts`

- [ ] **Step 1: Create the github.ts module**

Create `src/modules/code/github.ts`:

```typescript
/**
 * GitHub API helpers — direct REST calls using the Composio-managed OAuth token.
 * Faster than going through Composio's meta-tool pattern for code operations.
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Fetch the GitHub OAuth token from Composio's connected accounts.
 */
export async function getGitHubToken(orgId: string): Promise<string | null> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch(
      'https://backend.composio.dev/api/v1/connectedAccounts?showActiveOnly=true',
      { headers: { 'x-api-key': apiKey } }
    );
    const data = await resp.json();
    const githubAccount = (data.items || []).find(
      (item: any) => item.appName === 'github' && item.status === 'ACTIVE'
    );
    if (!githubAccount?.id) return null;

    // Fetch the actual token from the connected account
    const tokenResp = await fetch(
      `https://backend.composio.dev/api/v1/connectedAccounts/${githubAccount.id}`,
      { headers: { 'x-api-key': apiKey } }
    );
    const tokenData = await tokenResp.json();
    return tokenData?.connectionParams?.access_token || null;
  } catch (error) {
    console.error('[code/github] Failed to get GitHub token:', error);
    return null;
  }
}

async function githubFetch(token: string, path: string): Promise<any> {
  const resp = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Cooper-AI',
    },
  });
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

/**
 * Get the file/directory tree for a repo or subdirectory.
 */
export async function getRepoTree(
  token: string,
  owner: string,
  repo: string,
  path: string = ''
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; size?: number }>> {
  const apiPath = path
    ? `/repos/${owner}/${repo}/contents/${path}`
    : `/repos/${owner}/${repo}/contents`;

  const data = await githubFetch(token, apiPath);
  const items = Array.isArray(data) ? data : [];

  return items.map((item: any) => ({
    name: item.name,
    path: item.path,
    type: item.type === 'dir' ? 'dir' : 'file',
    size: item.size,
  }));
}

/**
 * Get file content with line numbers.
 */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ content: string; lines: number }> {
  const query = ref ? `?ref=${ref}` : '';
  const data = await githubFetch(token, `/repos/${owner}/${repo}/contents/${path}${query}`);

  if (data.type !== 'file' || !data.content) {
    throw new Error(`${path} is not a file`);
  }

  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  const lines = content.split('\n').length;

  // Add line numbers
  const numbered = content
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
    .join('\n');

  return { content: numbered, lines };
}

/**
 * Search code in a repo.
 */
export async function searchCode(
  token: string,
  owner: string,
  repo: string,
  query: string
): Promise<Array<{ path: string; matches: string[] }>> {
  const encoded = encodeURIComponent(`${query} repo:${owner}/${repo}`);
  const data = await githubFetch(token, `/search/code?q=${encoded}&per_page=10`);

  return (data.items || []).map((item: any) => ({
    path: item.path,
    matches: (item.text_matches || []).map((m: any) => m.fragment).filter(Boolean),
  }));
}

/**
 * Create a pull request.
 */
export async function createPR(
  token: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<{ url: string; number: number }> {
  const resp = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Cooper-AI',
    },
    body: JSON.stringify({ title, body, head, base }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to create PR: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return { url: data.html_url, number: data.number };
}

/**
 * Get the default branch for a repo.
 */
export async function getDefaultBranch(
  token: string,
  owner: string,
  repo: string
): Promise<string> {
  const data = await githubFetch(token, `/repos/${owner}/${repo}`);
  return data.default_branch || 'main';
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Only pre-existing errors

- [ ] **Step 3: Commit**

```bash
git add src/modules/code/github.ts
git commit -m "feat: GitHub API helpers — token fetch, file tree, content, search, PR creation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Repo Index

**Files:**
- Create: `src/modules/code/repo-index.ts`

- [ ] **Step 1: Create the repo-index.ts module**

Create `src/modules/code/repo-index.ts`:

```typescript
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

/**
 * Recursively build a file tree string, excluding ignored directories.
 */
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

/**
 * Detect tech stack from config file contents.
 */
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

/**
 * Get or create a repo index. Checks workspace notes cache first.
 */
export async function getOrCreateRepoIndex(
  supabase: SupabaseClient,
  orgId: string,
  token: string,
  owner: string,
  repo: string
): Promise<RepoIndex> {
  const noteKey = `repo:${owner}/${repo}`;

  // Check cache
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

  // Build fresh index
  console.log(`[code] Building index for ${owner}/${repo}`);
  const tree = await buildTree(token, owner, repo);

  // Read config files
  const configs: Record<string, string> = {};
  const rootItems = await getRepoTree(token, owner, repo);
  for (const item of rootItems) {
    if (CONFIG_FILES.includes(item.name) && item.type === 'file') {
      try {
        const { content } = await getFileContent(token, owner, repo, item.path);
        // Store raw content (without line numbers) for parsing
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

  // Cache in workspace notes
  await saveNote(supabase, orgId, noteKey, JSON.stringify(index));
  console.log(`[code] Indexed ${owner}/${repo}: ${techStack.language}, ${techStack.framework || 'no framework'}`);

  return index;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Only pre-existing errors

- [ ] **Step 3: Commit**

```bash
git add src/modules/code/repo-index.ts
git commit -m "feat: repo index — file tree + tech stack detection, cached in workspace notes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Code Tools

**Files:**
- Create: `src/modules/code/tools.ts`

- [ ] **Step 1: Create the tools.ts module**

Create `src/modules/code/tools.ts`:

```typescript
/**
 * Code tools — investigation via GitHub API, development via E2B sandbox.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  getGitHubToken,
  getFileContent,
  searchCode,
  createPR,
  getDefaultBranch,
} from './github';
import { getOrCreateRepoIndex } from './repo-index';
import { getOrCreateSession } from '@/modules/sandbox/manager';

export function createCodeTools(
  supabase: SupabaseClient,
  orgId: string,
  threadId: string
) {
  // Lazy-load the token — cached after first call
  let _token: string | null = null;
  const getToken = async () => {
    if (!_token) _token = await getGitHubToken(orgId);
    if (!_token) throw new Error('GitHub not connected. Connect GitHub in the integrations page.');
    return _token;
  };

  // Track which repo is cloned in the sandbox
  let clonedRepo: { owner: string; repo: string; path: string } | null = null;

  return {
    // -----------------------------------------------------------------
    // Investigation tools (GitHub API, no sandbox)
    // -----------------------------------------------------------------

    explore_repo: tool({
      description: `Explore a GitHub repository's structure. Returns the file tree and detected tech stack (language, framework, test command). Results are cached — fast on repeat calls. Use this first when working with any repo.`,
      inputSchema: z.object({
        owner: z.string().describe('GitHub owner/org, e.g. "myorg"'),
        repo: z.string().describe('Repository name, e.g. "api-service"'),
        path: z.string().optional().describe('Subdirectory to explore, e.g. "src/auth"'),
      }),
      execute: async ({ owner, repo, path }) => {
        try {
          const token = await getToken();
          const index = await getOrCreateRepoIndex(supabase, orgId, token, owner, repo);

          if (path) {
            // Return just the subtree for the requested path
            const lines = index.tree.split('\n');
            const filtered = lines.filter(l => {
              const trimmed = l.trimStart();
              return l.includes(path) || trimmed.length === 0;
            });
            return {
              owner, repo, path,
              tree: filtered.join('\n') || `No files found at ${path}`,
              techStack: index.techStack,
            };
          }

          return {
            owner, repo,
            tree: index.tree,
            techStack: index.techStack,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    read_code: tool({
      description: `Read a file from a GitHub repository. Returns content with line numbers. Optionally read just a line range for large files.`,
      inputSchema: z.object({
        owner: z.string().describe('GitHub owner/org'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('File path, e.g. "src/auth/middleware.ts"'),
        startLine: z.number().optional().describe('Start line (1-based)'),
        endLine: z.number().optional().describe('End line (1-based)'),
      }),
      execute: async ({ owner, repo, path, startLine, endLine }) => {
        try {
          const token = await getToken();
          const result = await getFileContent(token, owner, repo, path);

          if (startLine || endLine) {
            const lines = result.content.split('\n');
            const start = (startLine || 1) - 1;
            const end = endLine || lines.length;
            return {
              path,
              content: lines.slice(start, end).join('\n'),
              totalLines: result.lines,
              showing: `${start + 1}-${Math.min(end, result.lines)}`,
            };
          }

          return { path, content: result.content, totalLines: result.lines };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    search_code: tool({
      description: `Search for code across a GitHub repository. Returns matching files with code snippets. Use to find where something is defined, used, or referenced.`,
      inputSchema: z.object({
        owner: z.string().describe('GitHub owner/org'),
        repo: z.string().describe('Repository name'),
        query: z.string().describe('Search query — function names, error messages, imports, etc.'),
      }),
      execute: async ({ owner, repo, query }) => {
        try {
          const token = await getToken();
          const results = await searchCode(token, owner, repo, query);
          if (results.length === 0) {
            return { results: [], message: `No results for "${query}" in ${owner}/${repo}` };
          }
          return {
            results: results.map(r => ({
              path: r.path,
              snippets: r.matches.slice(0, 3),
            })),
            message: `Found ${results.length} file(s) matching "${query}"`,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    // -----------------------------------------------------------------
    // Development tools (E2B sandbox)
    // -----------------------------------------------------------------

    clone_repo: tool({
      description: `Clone a GitHub repository into the sandbox for making changes. Sets up git identity and auth. Call this before edit_file or run_command.`,
      inputSchema: z.object({
        owner: z.string().describe('GitHub owner/org'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().describe('Branch to clone (defaults to the repo default branch)'),
      }),
      execute: async ({ owner, repo, branch }) => {
        try {
          const token = await getToken();
          const defaultBranch = branch || await getDefaultBranch(token, owner, repo);
          const session = getOrCreateSession(orgId, threadId);
          const repoPath = `/home/user/${repo}`;

          // Clone with token auth
          const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
          const result = await session.execute(
            `git clone --depth 50 -b ${defaultBranch} ${cloneUrl} ${repoPath} 2>&1 && ` +
            `cd ${repoPath} && ` +
            `git config user.name "Cooper AI" && ` +
            `git config user.email "cooper@coworker.com" && ` +
            `echo "Cloned successfully" && ls`,
            'bash'
          );

          if (result.exitCode !== 0) {
            return { cloned: false, error: result.stderr || result.stdout };
          }

          clonedRepo = { owner, repo, path: repoPath };

          return {
            cloned: true,
            path: repoPath,
            branch: defaultBranch,
            message: `Cloned ${owner}/${repo} (${defaultBranch}) into sandbox`,
          };
        } catch (error) {
          return { cloned: false, error: String(error) };
        }
      },
    }),

    edit_file: tool({
      description: `Make a surgical edit to a file in the cloned repo. Replaces old_text with new_text. For creating new files, use run_command with a heredoc or write_file.`,
      inputSchema: z.object({
        path: z.string().describe('File path relative to repo root, e.g. "src/auth/middleware.ts"'),
        old_text: z.string().describe('Exact text to find and replace'),
        new_text: z.string().describe('Replacement text'),
      }),
      execute: async ({ path, old_text, new_text }) => {
        if (!clonedRepo) return { error: 'No repo cloned. Call clone_repo first.' };
        try {
          const session = getOrCreateSession(orgId, threadId);
          const fullPath = `${clonedRepo.path}/${path}`;

          // Read current content
          const content = await session.readFile(fullPath);
          if (!content.includes(old_text)) {
            return { error: `Could not find the specified text in ${path}. Make sure old_text matches exactly.` };
          }

          // Replace and write back
          const updated = content.replace(old_text, new_text);
          await session.writeFile(fullPath, updated);

          return { edited: true, path };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    run_command: tool({
      description: `Run a shell command in the cloned repo directory. Use for: running tests, installing dependencies, building, linting, creating files, or any other shell operation.`,
      inputSchema: z.object({
        command: z.string().describe('Shell command to run, e.g. "npm test", "pytest", "ls -la src/"'),
      }),
      execute: async ({ command }) => {
        if (!clonedRepo) return { error: 'No repo cloned. Call clone_repo first.' };
        try {
          const session = getOrCreateSession(orgId, threadId);
          const result = await session.execute(
            `cd ${clonedRepo.path} && ${command}`,
            'bash'
          );

          return {
            exitCode: result.exitCode,
            stdout: result.stdout || undefined,
            stderr: result.stderr || undefined,
            success: result.exitCode === 0,
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
    }),

    create_pull_request: tool({
      description: `Commit all changes, push a new branch, and create a pull request on GitHub. Call this after making and testing your changes.`,
      inputSchema: z.object({
        title: z.string().describe('PR title in conventional commit format, e.g. "fix: null check in auth middleware"'),
        body: z.string().describe('PR description — what changed, why, and what was tested'),
        branch_name: z.string().optional().describe('Branch name (defaults to cooper/{slug-from-title})'),
      }),
      execute: async ({ title, body, branch_name }) => {
        if (!clonedRepo) return { error: 'No repo cloned. Call clone_repo first.' };
        try {
          const token = await getToken();
          const session = getOrCreateSession(orgId, threadId);
          const { owner, repo, path: repoPath } = clonedRepo;

          // Generate branch name
          const slug = branch_name || `cooper/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;

          // Create branch, commit, push
          const gitResult = await session.execute(
            `cd ${repoPath} && ` +
            `git checkout -b ${slug} && ` +
            `git add -A && ` +
            `git commit -m "${title.replace(/"/g, '\\"')}" && ` +
            `git push origin ${slug} 2>&1`,
            'bash'
          );

          if (gitResult.exitCode !== 0) {
            return { created: false, error: gitResult.stderr || gitResult.stdout };
          }

          // Get default branch for PR base
          const defaultBranch = await getDefaultBranch(token, owner, repo);

          // Create PR via GitHub API
          const pr = await createPR(token, owner, repo, slug, defaultBranch, title, body);

          return {
            created: true,
            url: pr.url,
            number: pr.number,
            branch: slug,
            message: `PR #${pr.number} created: ${pr.url}`,
          };
        } catch (error) {
          return { created: false, error: String(error) };
        }
      },
    }),
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: Only pre-existing errors

- [ ] **Step 3: Commit**

```bash
git add src/modules/code/tools.ts
git commit -m "feat: code tools — explore, read, search, clone, edit, run, create PR

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Engine Integration + System Prompt

**Files:**
- Modify: `src/modules/agent/engine.ts`

- [ ] **Step 1: Add import and register code tools**

In `src/modules/agent/engine.ts`, add the import at the top with the other tool imports:
```typescript
import { createCodeTools } from '@/modules/code/tools';
```

After the sandbox tools registration block (`if (process.env.E2B_API_KEY) { ... }`), add:
```typescript
  // Register code tools when GitHub is connected
  const hasGitHub = input.connectedServices?.some(s => s.toLowerCase().includes('github'));
  if (hasGitHub && input.supabase && process.env.E2B_API_KEY) {
    const codeTools = createCodeTools(input.supabase, input.orgId, input.threadId);
    Object.assign(builtInTools, codeTools);
  }
```

- [ ] **Step 2: Add system prompt section**

In the `SYSTEM_PROMPT` constant in `engine.ts`, add before the `## Memory` section:

```typescript
## Code & Development
You can investigate codebases and make code changes on GitHub. When the user references a repo or asks about code:
- Use explore_repo and search_code to understand the codebase first
- Use read_code to examine specific files
- When making changes: clone_repo → edit files → run tests → create_pull_request
- Always create a PR for code changes — never just describe changes without implementing them
- Check workspace notes for cached repo indexes before exploring
- For complex features, use plan_task first to outline your approach
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Only pre-existing errors

- [ ] **Step 4: Commit**

```bash
git add src/modules/agent/engine.ts
git commit -m "feat: register code tools in engine, add code development system prompt

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
