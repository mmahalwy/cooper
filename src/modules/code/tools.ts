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
  let _token: string | null = null;
  const getToken = async () => {
    if (!_token) _token = await getGitHubToken(orgId);
    if (!_token) throw new Error('GitHub not connected. Connect GitHub in the integrations page.');
    return _token;
  };

  let clonedRepo: { owner: string; repo: string; path: string } | null = null;

  return {
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

    // Development tools — only available when E2B sandbox is configured
    ...(process.env.E2B_API_KEY ? {

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

          const content = await session.readFile(fullPath);
          if (!content.includes(old_text)) {
            return { error: `Could not find the specified text in ${path}. Make sure old_text matches exactly.` };
          }

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

          const slug = branch_name || `cooper/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;

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

          const defaultBranch = await getDefaultBranch(token, owner, repo);
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

    } : {}), // end E2B-only tools
  };
}
