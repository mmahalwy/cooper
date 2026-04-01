# Cooper Code Capabilities — Investigate, Develop, Ship

> Design spec for giving Cooper full development capabilities. Approved 2026-04-01.

## Overview

Cooper can investigate codebases, understand code, make changes, run tests, and create pull requests. Two modes operate seamlessly:

- **Investigate mode** — GitHub API (via Composio) for reading files, searching code, exploring structure. Fast, no sandbox needed.
- **Work mode** — E2B sandbox for cloning repos, making edits, running tests, pushing branches. Full terminal access.

Cooper automatically decides which mode to use based on the task.

## Auth

Uses the existing Composio GitHub OAuth integration. When a user connects GitHub through the integrations page, Composio stores the token. Cooper uses this token to:
- Call GitHub API for file reads, search, PR creation
- Clone private repos into the sandbox via `https://x-access-token:{token}@github.com/owner/repo.git`

No new auth flow needed. Cooper can access any repo the user's GitHub account has permissions for.

## New Module

`src/modules/code/` with three files:

### `github.ts` — GitHub API Helpers

Wraps Composio's GitHub token to make direct GitHub API calls for operations that are faster than Composio's meta-tool pattern.

**Functions:**
- `getGitHubToken(supabase, orgId)` — Fetches the GitHub OAuth token from Composio's connected accounts API
- `getRepoTree(token, owner, repo, path?)` — Returns file/directory listing via GitHub Trees API
- `getFileContent(token, owner, repo, path, ref?)` — Returns file content with line numbers
- `searchCode(token, owner, repo, query)` — GitHub code search API
- `createPR(token, owner, repo, head, base, title, body)` — Creates a pull request

### `repo-index.ts` — Light Codebase Index

On first access to any repo, builds and caches a light index.

**What's indexed:**
- File tree (excluding `node_modules`, `.git`, `dist`, `build`, `vendor`, `__pycache__`)
- Key config files read in full: `README.md`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`
- Tech stack detection: language, framework, test command, package manager

**Storage:** Workspace notes via existing `save_note`/`read_note`, keyed by `repo:{owner}/{repo}`.

**Cache:** Refreshed if older than 24 hours or on clone.

**Functions:**
- `getOrCreateRepoIndex(supabase, orgId, token, owner, repo)` — Returns cached index or builds one
- `detectTechStack(configFiles)` — Parses configs to detect language, framework, test command
- `formatRepoIndex(tree, configs, stack)` — Formats for workspace note storage

### `tools.ts` — Agent Tools

**Investigation tools (GitHub API, no sandbox):**

| Tool | Input | Output |
|------|-------|--------|
| `explore_repo` | `owner`, `repo`, `path?` | File tree + tech stack. Caches index on first call. |
| `read_code` | `owner`, `repo`, `path`, `startLine?`, `endLine?` | File content with line numbers |
| `search_code` | `owner`, `repo`, `query` | Matching files with snippets |

**Development tools (E2B sandbox):**

| Tool | Input | Output |
|------|-------|--------|
| `clone_repo` | `owner`, `repo`, `branch?` | Clones into sandbox at `/home/user/{repo}`. Sets git identity. |
| `edit_file` | `path`, `old_text`, `new_text` | Surgical edit — replaces old_text with new_text in the cloned repo |
| `run_command` | `command` | Runs shell command in repo directory. For tests, builds, linting. |
| `create_pull_request` | `title`, `body`, `branch_name?` | Commits all changes, pushes branch, creates PR. Returns PR URL. |

**Tool dependencies:**
- Investigation tools need: `supabase`, `orgId` (for Composio token + workspace notes)
- Development tools need: `supabase`, `orgId`, `threadId` (for sandbox session)
- All registered in engine.ts when GitHub is connected

## Typical Flows

### Investigation: "Explain how auth works in myorg/api"

1. `explore_repo("myorg", "api")` → file tree + tech stack (cached)
2. `search_code("myorg", "api", "authentication middleware")` → finds `src/auth/middleware.ts`
3. `read_code("myorg", "api", "src/auth/middleware.ts")` → reads full file
4. Cooper explains the auth flow in chat

### Bug fix: "Fix the null pointer in myorg/api auth"

1. `explore_repo("myorg", "api")` → cached index
2. `search_code("myorg", "api", "null authentication")` → finds relevant files
3. `read_code("myorg", "api", "src/auth/middleware.ts")` → identifies the bug
4. `clone_repo("myorg", "api")` → clones into sandbox
5. `edit_file("src/auth/middleware.ts", "const user = getUser()", "const user = getUser()\nif (!user) return unauthorized()")` → makes fix
6. `run_command("npm test")` → tests pass
7. `create_pull_request("fix: null check in auth middleware", "Added null check for user object...")` → PR created, URL shown in chat

### Feature: "Add rate limiting to the API endpoints"

1. `explore_repo` → understand structure
2. `read_code` on key files → understand existing middleware pattern
3. Cooper calls `plan_task` to create a plan (uses planning tools from Phase 3)
4. User approves plan
5. `clone_repo` → clone into sandbox
6. Multiple `edit_file` calls + `run_command("touch src/middleware/rate-limit.ts")` for new files
7. `run_command("npm test")` → best effort
8. `create_pull_request` → PR with full description

## PR Creation Details

**Branch naming:** `cooper/{short-description}` (e.g., `cooper/fix-auth-null-check`)

**Commit message:** Conventional commit format based on the change type.

**PR body:** Auto-generated with:
- What was changed and why
- Files modified
- Test results (if tests were run)

**Base branch:** Auto-detected from the repo's default branch.

**Test running (best effort):**
- Check repo index for test command (from `package.json` scripts, `Makefile`, etc.)
- If found, run via `run_command`. Timeout: 2 minutes.
- If tests pass → create PR
- If tests fail → try to fix once, then create PR anyway with a note
- If no test command or timeout → create PR without testing

## System Prompt Addition

```
## Code & Development
You can investigate codebases and make code changes on GitHub. When the user
references a repo or asks about code:
- Use explore_repo and search_code to understand the codebase first
- Use read_code to examine specific files
- When making changes: clone_repo → edit files → run tests → create_pull_request
- Always create a PR for code changes — never just describe changes without implementing
- Check workspace notes for cached repo indexes before exploring
- For complex features, use plan_task first to outline your approach
```

## Model Routing

Code tasks naturally route to the `complex` tier (Claude Sonnet / GPT-4o) via existing keyword detection. No special routing changes needed.

## Engine Integration

In `src/modules/agent/engine.ts`, register code tools when GitHub is connected:

```typescript
// Check if GitHub is connected
const hasGitHub = input.connectedServices?.some(s => s.toLowerCase().includes('github'));
if (hasGitHub && input.supabase) {
  const codeTools = createCodeTools(input.supabase, input.orgId, input.threadId);
  Object.assign(builtInTools, codeTools);
}
```

## Not in Scope (for now)

- GitLab / Bitbucket support (GitHub only for v1)
- Reviewing PRs others created (could come later)
- CI/CD integration (rely on the repo's existing CI)
- Branch protection bypass
- Direct commits to main (always branch + PR)
