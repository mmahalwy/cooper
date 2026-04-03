# Slack App Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users interact with Cooper in Slack via DMs and @mentions, with full agent capabilities (tools, memory, files).

**Architecture:** A Next.js API route (`/api/slack/events`) receives Slack events, verifies signatures, returns 200 immediately, then processes asynchronously via `after()`. Uses `generateText` (not `streamText`) since responses are posted as complete messages. Maps Slack workspaces to Cooper orgs 1:1.

**Tech Stack:** `@slack/web-api` for Slack API, existing `ai` SDK `generateText`, Supabase service client (bypasses RLS), Next.js `after()` for async processing.

**Spec:** `docs/superpowers/specs/2026-04-02-slack-app-integration-design.md`

---

## File Structure

```
src/modules/slack/
  types.ts             -- Slack event types and DB row types
  verify.ts            -- Request signature verification
  client.ts            -- WebClient factory from DB bot_token
  installations.ts     -- DB queries for slack_installations
  users.ts             -- Slack user -> Cooper user resolution
  threads.ts           -- Thread mapping + Slack history -> AI SDK messages
  format.ts            -- Markdown -> Slack mrkdwn conversion
  files.ts             -- File upload to Slack (uploadV2 + link fallback)
  handlers.ts          -- Core event handlers (app_mention, message.im)

src/modules/slack/__tests__/
  verify.test.ts       -- Signature verification tests
  format.test.ts       -- Markdown conversion tests
  threads.test.ts      -- Thread history conversion tests
  handlers.test.ts     -- Handler logic tests

src/app/api/slack/
  events/route.ts      -- POST endpoint for Slack events

supabase/migrations/
  018_slack_integration.sql  -- New tables
```

---

### Task 1: Install `@slack/web-api` and add migration

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/018_slack_integration.sql`

- [ ] **Step 1: Install the Slack Web API package**

```bash
pnpm add @slack/web-api
```

- [ ] **Step 2: Create the database migration**

Create `supabase/migrations/018_slack_integration.sql`:

```sql
-- Slack workspace installations
create table public.slack_installations (
  id uuid primary key default gen_random_uuid(),
  team_id text unique not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  bot_token text not null,
  bot_user_id text not null,
  installed_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_slack_installations_team_id on public.slack_installations(team_id);
create index idx_slack_installations_org_id on public.slack_installations(org_id);

-- Map Slack users to Cooper users
create table public.slack_user_mappings (
  id uuid primary key default gen_random_uuid(),
  slack_user_id text not null,
  slack_team_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(slack_user_id, slack_team_id)
);

create index idx_slack_user_mappings_lookup on public.slack_user_mappings(slack_user_id, slack_team_id);

-- Map Slack threads to Cooper threads
create table public.slack_thread_mappings (
  id uuid primary key default gen_random_uuid(),
  slack_channel_id text not null,
  slack_thread_ts text not null,
  thread_id uuid not null references public.threads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(slack_channel_id, slack_thread_ts)
);

create index idx_slack_thread_mappings_lookup on public.slack_thread_mappings(slack_channel_id, slack_thread_ts);

-- No RLS on these tables — accessed via service role client only
```

- [ ] **Step 3: Apply the migration**

```bash
pnpm supabase migration up --local 2>/dev/null || echo "Apply manually if not using local Supabase"
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml supabase/migrations/018_slack_integration.sql
git commit -m "feat(slack): add @slack/web-api dependency and DB migration"
```

---

### Task 2: Slack types

**Files:**
- Create: `src/modules/slack/types.ts`

- [ ] **Step 1: Create type definitions**

Create `src/modules/slack/types.ts`:

```typescript
// Slack event envelope
export interface SlackEventEnvelope {
  type: 'url_verification' | 'event_callback';
  challenge?: string;
  token?: string;
  team_id: string;
  event: SlackEvent;
}

// Union of events we handle
export type SlackEvent = AppMentionEvent | MessageImEvent;

export interface AppMentionEvent {
  type: 'app_mention';
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  team?: string;
  bot_id?: string;
  bot_profile?: unknown;
}

export interface MessageImEvent {
  type: 'message';
  channel_type: 'im';
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  team?: string;
  subtype?: string;
  bot_id?: string;
  bot_profile?: unknown;
}

// DB row types
export interface SlackInstallation {
  id: string;
  team_id: string;
  org_id: string;
  bot_token: string;
  bot_user_id: string;
  installed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlackUserMapping {
  id: string;
  slack_user_id: string;
  slack_team_id: string;
  user_id: string;
  org_id: string;
  created_at: string;
}

export interface SlackThreadMapping {
  id: string;
  slack_channel_id: string;
  slack_thread_ts: string;
  thread_id: string;
  org_id: string;
  created_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/slack/types.ts
git commit -m "feat(slack): add Slack event and DB row type definitions"
```

---

### Task 3: Request signature verification

**Files:**
- Create: `src/modules/slack/verify.ts`
- Create: `src/modules/slack/__tests__/verify.test.ts`

- [ ] **Step 1: Write failing tests for signature verification**

Create `src/modules/slack/__tests__/verify.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Helper to generate a valid Slack signature
function signRequest(signingSecret: string, timestamp: string, body: string): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  return `v0=${hmac.digest('hex')}`;
}

describe('verifySlackRequest', () => {
  const SIGNING_SECRET = 'test-signing-secret-1234';

  beforeEach(() => {
    vi.stubEnv('SLACK_SIGNING_SECRET', SIGNING_SECRET);
  });

  it('should accept a valid signature', async () => {
    const { verifySlackRequest } = await import('../verify');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = '{"type":"event_callback"}';
    const signature = signRequest(SIGNING_SECRET, timestamp, body);

    const result = verifySlackRequest(signature, timestamp, body);
    expect(result).toBe(true);
  });

  it('should reject an invalid signature', async () => {
    const { verifySlackRequest } = await import('../verify');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = '{"type":"event_callback"}';

    const result = verifySlackRequest('v0=invalidsignature', timestamp, body);
    expect(result).toBe(false);
  });

  it('should reject a request older than 5 minutes', async () => {
    const { verifySlackRequest } = await import('../verify');
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
    const body = '{"type":"event_callback"}';
    const signature = signRequest(SIGNING_SECRET, oldTimestamp, body);

    const result = verifySlackRequest(signature, oldTimestamp, body);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/modules/slack/__tests__/verify.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement signature verification**

Create `src/modules/slack/verify.ts`:

```typescript
import crypto from 'crypto';

const MAX_AGE_SECONDS = 60 * 5; // 5 minutes

export function verifySlackRequest(
  signature: string,
  timestamp: string,
  rawBody: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('[slack] SLACK_SIGNING_SECRET is not set');
    return false;
  }

  // Reject requests older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > MAX_AGE_SECONDS) {
    console.warn('[slack] Request timestamp too old:', timestamp);
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBasestring);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/modules/slack/__tests__/verify.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/slack/verify.ts src/modules/slack/__tests__/verify.test.ts
git commit -m "feat(slack): add request signature verification with replay protection"
```

---

### Task 4: Slack Web API client factory

**Files:**
- Create: `src/modules/slack/client.ts`
- Create: `src/modules/slack/installations.ts`

- [ ] **Step 1: Create the installations DB module**

Create `src/modules/slack/installations.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SlackInstallation } from './types';

export async function getInstallationByTeamId(
  supabase: SupabaseClient,
  teamId: string
): Promise<SlackInstallation | null> {
  const { data, error } = await supabase
    .from('slack_installations')
    .select('*')
    .eq('team_id', teamId)
    .single();

  if (error || !data) {
    console.error('[slack] Installation not found for team:', teamId, error);
    return null;
  }

  return data as SlackInstallation;
}
```

- [ ] **Step 2: Create the Slack client factory**

Create `src/modules/slack/client.ts`:

```typescript
import { WebClient } from '@slack/web-api';

const clientCache = new Map<string, WebClient>();

export function getSlackClient(botToken: string): WebClient {
  let client = clientCache.get(botToken);
  if (!client) {
    client = new WebClient(botToken);
    clientCache.set(botToken, client);
  }
  return client;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/slack/client.ts src/modules/slack/installations.ts
git commit -m "feat(slack): add Slack client factory and installations DB queries"
```

---

### Task 5: Slack user resolution

**Files:**
- Create: `src/modules/slack/users.ts`

- [ ] **Step 1: Implement user resolution with auto-provisioning**

Create `src/modules/slack/users.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebClient } from '@slack/web-api';
import type { SlackUserMapping } from './types';

interface ResolvedUser {
  userId: string;
  orgId: string;
}

export async function resolveSlackUser(
  supabase: SupabaseClient,
  slackClient: WebClient,
  slackUserId: string,
  slackTeamId: string,
  orgId: string
): Promise<ResolvedUser | null> {
  // Check existing mapping
  const { data: existing } = await supabase
    .from('slack_user_mappings')
    .select('user_id, org_id')
    .eq('slack_user_id', slackUserId)
    .eq('slack_team_id', slackTeamId)
    .single();

  if (existing) {
    return { userId: existing.user_id, orgId: existing.org_id };
  }

  // Auto-provision: fetch Slack profile and create Cooper user
  let email: string;
  let name: string;
  try {
    const profile = await slackClient.users.info({ user: slackUserId });
    email = profile.user?.profile?.email || `${slackUserId}@slack.local`;
    name = profile.user?.real_name || profile.user?.name || slackUserId;
  } catch (err) {
    console.error('[slack] Failed to fetch user profile:', slackUserId, err);
    email = `${slackUserId}@slack.local`;
    name = slackUserId;
  }

  // Create auth user via Supabase admin API is not possible from service client.
  // Instead, create a users table entry directly with a deterministic UUID.
  // We use the slack user ID + team ID to generate a stable UUID.
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(`slack:${slackTeamId}:${slackUserId}`).digest('hex');
  const syntheticUserId = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // UUID v4-like
    '8' + hash.slice(17, 20), // UUID v4-like
    hash.slice(20, 32),
  ].join('-');

  // Insert into users table (ignore conflict if already exists)
  const { error: userError } = await supabase
    .from('users')
    .upsert({
      id: syntheticUserId,
      org_id: orgId,
      email,
      name,
      role: 'member',
    }, { onConflict: 'id' });

  if (userError) {
    console.error('[slack] Failed to create user:', userError);
    return null;
  }

  // Create the mapping
  await supabase.from('slack_user_mappings').insert({
    slack_user_id: slackUserId,
    slack_team_id: slackTeamId,
    user_id: syntheticUserId,
    org_id: orgId,
  });

  return { userId: syntheticUserId, orgId };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/slack/users.ts
git commit -m "feat(slack): add user resolution with auto-provisioning"
```

---

### Task 6: Markdown to Slack mrkdwn formatting

**Files:**
- Create: `src/modules/slack/format.ts`
- Create: `src/modules/slack/__tests__/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/modules/slack/__tests__/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { markdownToSlack } from '../format';

describe('markdownToSlack', () => {
  it('should convert **bold** to *bold*', () => {
    expect(markdownToSlack('This is **bold** text')).toBe('This is *bold* text');
  });

  it('should convert [text](url) to <url|text>', () => {
    expect(markdownToSlack('Click [here](https://example.com) now')).toBe(
      'Click <https://example.com|here> now'
    );
  });

  it('should not convert bold inside code blocks', () => {
    expect(markdownToSlack('`**not bold**`')).toBe('`**not bold**`');
  });

  it('should preserve triple-backtick code blocks', () => {
    const input = '```\nconst x = 1;\n```';
    expect(markdownToSlack(input)).toBe(input);
  });

  it('should handle multiple conversions in one string', () => {
    const input = '**Hello** and [link](https://x.com)';
    expect(markdownToSlack(input)).toBe('*Hello* and <https://x.com|link>');
  });

  it('should convert markdown headers to bold text', () => {
    expect(markdownToSlack('## Section Title')).toBe('*Section Title*');
    expect(markdownToSlack('### Subsection')).toBe('*Subsection*');
  });

  it('should return empty string for empty input', () => {
    expect(markdownToSlack('')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/modules/slack/__tests__/format.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement markdown to Slack conversion**

Create `src/modules/slack/format.ts`:

```typescript
export function markdownToSlack(text: string): string {
  if (!text) return '';

  // Split on code blocks to avoid converting inside them
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return parts
    .map((part, i) => {
      // Odd indices are code blocks — leave them alone
      if (i % 2 === 1) return part;

      return part
        // Headers -> bold (## Title -> *Title*)
        .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
        // Bold **text** -> *text*
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        // Links [text](url) -> <url|text>
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');
    })
    .join('');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/modules/slack/__tests__/format.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/slack/format.ts src/modules/slack/__tests__/format.test.ts
git commit -m "feat(slack): add markdown to Slack mrkdwn conversion"
```

---

### Task 7: Thread context — mapping and history conversion

**Files:**
- Create: `src/modules/slack/threads.ts`
- Create: `src/modules/slack/__tests__/threads.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/modules/slack/__tests__/threads.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { convertSlackHistoryToMessages } from '../threads';

describe('convertSlackHistoryToMessages', () => {
  const botUserId = 'U_BOT';

  it('should convert bot messages to assistant role', () => {
    const messages = [
      { user: 'U_BOT', text: 'Hello!', ts: '1.0', bot_id: 'B123' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([{ role: 'assistant', content: 'Hello!' }]);
  });

  it('should convert user messages to user role', () => {
    const messages = [
      { user: 'U_USER', text: 'Hey Cooper', ts: '1.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([{ role: 'user', content: 'Hey Cooper' }]);
  });

  it('should strip bot mentions from text', () => {
    const messages = [
      { user: 'U_USER', text: '<@U_BOT> what is the weather?', ts: '1.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([{ role: 'user', content: 'what is the weather?' }]);
  });

  it('should handle mixed thread history in order', () => {
    const messages = [
      { user: 'U_USER', text: '<@U_BOT> hello', ts: '1.0' },
      { user: 'U_BOT', text: 'Hi there!', ts: '2.0', bot_id: 'B123' },
      { user: 'U_USER', text: 'thanks', ts: '3.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'thanks' },
    ]);
  });

  it('should skip messages with empty text after stripping', () => {
    const messages = [
      { user: 'U_USER', text: '<@U_BOT>', ts: '1.0' },
    ];
    const result = convertSlackHistoryToMessages(messages, botUserId);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/modules/slack/__tests__/threads.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement thread module**

Create `src/modules/slack/threads.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebClient } from '@slack/web-api';
import type { ModelMessage } from 'ai';

export interface SlackMessage {
  user: string;
  text: string;
  ts: string;
  bot_id?: string;
}

export function convertSlackHistoryToMessages(
  messages: SlackMessage[],
  botUserId: string
): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    const isBot = msg.bot_id || msg.user === botUserId;
    // Strip bot mentions
    const cleanText = msg.text.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim();
    if (!cleanText) continue;

    result.push({
      role: isBot ? 'assistant' : 'user',
      content: cleanText,
    });
  }

  return result;
}

export async function getSlackThreadHistory(
  slackClient: WebClient,
  channel: string,
  threadTs: string,
  botUserId: string
): Promise<ModelMessage[]> {
  const response = await slackClient.conversations.replies({
    channel,
    ts: threadTs,
    limit: 50,
  });

  const messages = (response.messages || []).map((m) => ({
    user: m.user || '',
    text: m.text || '',
    ts: m.ts || '',
    bot_id: m.bot_id,
  }));

  return convertSlackHistoryToMessages(messages, botUserId);
}

export async function findOrCreateThreadMapping(
  supabase: SupabaseClient,
  slackChannelId: string,
  slackThreadTs: string,
  orgId: string,
  userId: string
): Promise<{ threadId: string; isNew: boolean }> {
  // Check for existing mapping
  const { data: existing } = await supabase
    .from('slack_thread_mappings')
    .select('thread_id')
    .eq('slack_channel_id', slackChannelId)
    .eq('slack_thread_ts', slackThreadTs)
    .single();

  if (existing) {
    return { threadId: existing.thread_id, isNew: false };
  }

  // Create new Cooper thread
  const { data: thread, error } = await supabase
    .from('threads')
    .insert({
      org_id: orgId,
      user_id: userId,
      title: 'Slack conversation',
    })
    .select('id')
    .single();

  if (error || !thread) {
    throw new Error(`Failed to create thread: ${error?.message}`);
  }

  // Create mapping
  await supabase.from('slack_thread_mappings').insert({
    slack_channel_id: slackChannelId,
    slack_thread_ts: slackThreadTs,
    thread_id: thread.id,
    org_id: orgId,
  });

  return { threadId: thread.id, isNew: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/modules/slack/__tests__/threads.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/slack/threads.ts src/modules/slack/__tests__/threads.test.ts
git commit -m "feat(slack): add thread mapping and history conversion"
```

---

### Task 8: File upload utilities

**Files:**
- Create: `src/modules/slack/files.ts`

- [ ] **Step 1: Implement file upload**

Create `src/modules/slack/files.ts`:

```typescript
import type { WebClient } from '@slack/web-api';

const MAX_DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

interface FileToUpload {
  filename: string;
  content: Buffer | string;
  mimeType?: string;
}

export async function uploadFilesToSlack(
  slackClient: WebClient,
  channel: string,
  threadTs: string,
  files: FileToUpload[]
): Promise<void> {
  for (const file of files) {
    const size = typeof file.content === 'string'
      ? Buffer.byteLength(file.content)
      : file.content.length;

    if (size > MAX_DIRECT_UPLOAD_BYTES) {
      console.warn(`[slack] File ${file.filename} too large (${size} bytes), skipping upload`);
      continue;
    }

    try {
      await slackClient.filesUploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        filename: file.filename,
        file: typeof file.content === 'string' ? Buffer.from(file.content) : file.content,
      });
    } catch (err) {
      console.error(`[slack] Failed to upload file ${file.filename}:`, err);
    }
  }
}

/**
 * Scan agent tool call results for file artifacts.
 * Returns files that should be uploaded to Slack.
 */
export function extractFileArtifacts(
  steps: Array<{ toolCalls?: Array<{ toolName: string; args: Record<string, any> }>; toolResults?: Array<{ result: any }> }>
): FileToUpload[] {
  const files: FileToUpload[] = [];

  for (const step of steps) {
    if (!step.toolResults) continue;
    for (const tr of step.toolResults) {
      const result = tr.result;
      if (!result || typeof result !== 'object') continue;

      // Check for sandbox code execution artifacts (base64 images)
      if (result.artifacts && Array.isArray(result.artifacts)) {
        for (const artifact of result.artifacts) {
          if (artifact.type === 'image' && artifact.base64) {
            files.push({
              filename: artifact.filename || 'output.png',
              content: Buffer.from(artifact.base64, 'base64'),
              mimeType: 'image/png',
            });
          }
          if (artifact.type === 'file' && artifact.content) {
            files.push({
              filename: artifact.filename || 'output.txt',
              content: artifact.content,
            });
          }
        }
      }
    }
  }

  return files;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/slack/files.ts
git commit -m "feat(slack): add file upload utilities"
```

---

### Task 9: Core event handlers

**Files:**
- Create: `src/modules/slack/handlers.ts`

This is the central module that ties everything together. It receives parsed events and orchestrates: reaction, user resolution, thread resolution, agent execution, response posting.

- [ ] **Step 1: Implement the handlers**

Create `src/modules/slack/handlers.ts`:

```typescript
import { generateText, stepCountIs } from 'ai';
import type { WebClient } from '@slack/web-api';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppMentionEvent, MessageImEvent, SlackInstallation } from './types';
import { resolveSlackUser } from './users';
import { findOrCreateThreadMapping, getSlackThreadHistory } from './threads';
import { markdownToSlack } from './format';
import { uploadFilesToSlack, extractFileArtifacts } from './files';
import { getToolsForOrg } from '@/modules/connections/registry';
import { retrieveContext } from '@/modules/memory/retriever';
import { extractAndSaveMemories } from '@/modules/memory/extractor';
import { summarizeAndStoreThread } from '@/modules/memory/thread-summary';
import { selectModel } from '@/modules/agent/model-router';
import { trackUsage } from '@/modules/observability/usage';

// Re-import the system prompt builder and tool factories from the engine.
// The engine currently only exports createAgentStream which uses streamText.
// We need the same setup but with generateText. We'll import the building
// blocks directly and assemble them here.
import { createSaveKnowledgeTool } from '@/modules/memory/tools';
import { createScheduleTools } from '@/modules/scheduler/tools';
import { createSkillTools } from '@/modules/skills/tools';
import { createOrchestrationTools } from '@/modules/orchestration/tools';
import { createUsageTools } from '@/modules/observability/tools';
import { createSandboxTools } from '@/modules/sandbox/tools';
import { createPlanningTools } from '@/modules/agent/planner';
import { createDeepWorkTools } from '@/modules/agent/deep-work-tools';
import { createWorkspaceTools } from '@/modules/workspace/tools';
import { createCodeTools } from '@/modules/code/tools';
import { createIntegrationTool } from '@/modules/agent/integration-subagent';
import { buildSlackSystemPrompt } from './system-prompt';

interface HandlerContext {
  supabase: SupabaseClient;
  slackClient: WebClient;
  installation: SlackInstallation;
}

async function addReaction(slackClient: WebClient, channel: string, ts: string, emoji: string): Promise<void> {
  try {
    await slackClient.reactions.add({ channel, timestamp: ts, name: emoji });
  } catch (err) {
    console.error(`[slack] Failed to add :${emoji}: reaction:`, err);
  }
}

async function removeReaction(slackClient: WebClient, channel: string, ts: string, emoji: string): Promise<void> {
  try {
    await slackClient.reactions.remove({ channel, timestamp: ts, name: emoji });
  } catch (err) {
    // May fail if already removed — that's fine
  }
}

async function buildTools(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  threadId: string,
  connectedServices: string[]
): Promise<Record<string, any>> {
  const builtInTools: Record<string, any> = {};

  builtInTools.save_knowledge = createSaveKnowledgeTool(supabase, orgId);
  Object.assign(builtInTools, createScheduleTools(supabase, orgId, userId));
  Object.assign(builtInTools, createSkillTools(supabase, orgId));
  Object.assign(builtInTools, createOrchestrationTools(supabase, orgId));
  Object.assign(builtInTools, createUsageTools(supabase, orgId));
  Object.assign(builtInTools, createWorkspaceTools(supabase, orgId, threadId));
  Object.assign(builtInTools, createPlanningTools(supabase, orgId, threadId));
  Object.assign(builtInTools, createDeepWorkTools(supabase, orgId, userId, threadId));

  if (process.env.E2B_API_KEY) {
    Object.assign(builtInTools, createSandboxTools(orgId, threadId));
  }

  // Load Composio tools
  const composioTools = await getToolsForOrg(supabase, orgId, userId);
  if (Object.keys(composioTools).length > 0 && connectedServices.length > 0) {
    const integrationTool = createIntegrationTool(composioTools, connectedServices);
    Object.assign(builtInTools, integrationTool);
  }

  const hasGitHub = connectedServices.some(s => s.toLowerCase().includes('github'));
  if (hasGitHub && process.env.E2B_API_KEY) {
    Object.assign(builtInTools, createCodeTools(supabase, orgId, threadId));
  }

  return builtInTools;
}

async function processEvent(
  ctx: HandlerContext,
  slackUserId: string,
  slackTeamId: string,
  channel: string,
  messageTs: string,
  threadTs: string | undefined,
  userText: string
): Promise<void> {
  const { supabase, slackClient, installation } = ctx;

  // 1. Add thinking reaction
  await addReaction(slackClient, channel, messageTs, 'thinking_face');

  try {
    // 2. Resolve user
    const resolvedUser = await resolveSlackUser(
      supabase, slackClient, slackUserId, slackTeamId, installation.org_id
    );
    if (!resolvedUser) {
      throw new Error(`Failed to resolve Slack user ${slackUserId}`);
    }

    // 3. Determine the Slack thread to reply to.
    // If this message IS the thread parent (no thread_ts), we reply using the message's own ts.
    // If this message is IN a thread, we use the thread_ts.
    const replyThreadTs = threadTs || messageTs;

    // 4. Find or create Cooper thread mapping
    const { threadId } = await findOrCreateThreadMapping(
      supabase, channel, replyThreadTs, installation.org_id, resolvedUser.userId
    );

    // 5. Build conversation context from Slack thread history
    let messages;
    if (threadTs) {
      // Existing thread — fetch full history
      messages = await getSlackThreadHistory(slackClient, channel, threadTs, installation.bot_user_id);
    } else {
      // New conversation — just this message
      const cleanText = userText.replace(new RegExp(`<@${installation.bot_user_id}>`, 'g'), '').trim();
      messages = [{ role: 'user' as const, content: cleanText }];
    }

    // 6. Save user message to DB
    const cleanUserText = userText.replace(new RegExp(`<@${installation.bot_user_id}>`, 'g'), '').trim();
    await supabase.from('messages').insert({
      thread_id: threadId,
      role: 'user',
      content: cleanUserText,
    });

    // 7. Load org context
    const { data: activeConnections } = await supabase
      .from('connections')
      .select('name')
      .eq('org_id', installation.org_id)
      .eq('status', 'active');
    const connectedServices = (activeConnections || []).map((c: any) => c.name);

    const memoryContext = cleanUserText.trim()
      ? await retrieveContext(supabase, installation.org_id, cleanUserText)
      : { knowledge: [], matchedSkills: [], threadSummaries: [] };

    // 8. Build tools and system prompt
    const tools = await buildTools(
      supabase, installation.org_id, resolvedUser.userId, threadId, connectedServices
    );

    const systemPrompt = await buildSlackSystemPrompt(
      supabase, installation.org_id, memoryContext, connectedServices, cleanUserText
    );

    // 9. Generate response
    const modelSelection = selectModel(cleanUserText, connectedServices);
    console.log(`[slack] Generating response with ${modelSelection.modelId} for thread ${threadId}`);

    const result = await generateText({
      model: modelSelection.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(25),
    });

    const responseText = result.text || "I wasn't able to generate a response. Try again!";
    const slackText = markdownToSlack(responseText);

    // 10. Post response to Slack
    // Slack has a 40,000 character limit per message — split if needed
    const MAX_SLACK_LENGTH = 39000;
    if (slackText.length <= MAX_SLACK_LENGTH) {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: replyThreadTs,
        text: slackText,
        unfurl_links: false,
      });
    } else {
      // Split on paragraph boundaries
      const chunks: string[] = [];
      let remaining = slackText;
      while (remaining.length > 0) {
        if (remaining.length <= MAX_SLACK_LENGTH) {
          chunks.push(remaining);
          break;
        }
        const splitIndex = remaining.lastIndexOf('\n\n', MAX_SLACK_LENGTH);
        const cutAt = splitIndex > 0 ? splitIndex : MAX_SLACK_LENGTH;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt).trimStart();
      }
      for (const chunk of chunks) {
        await slackClient.chat.postMessage({
          channel,
          thread_ts: replyThreadTs,
          text: chunk,
          unfurl_links: false,
        });
      }
    }

    // 11. Upload file artifacts if any
    try {
      const steps = await result.steps;
      const fileArtifacts = extractFileArtifacts(steps);
      if (fileArtifacts.length > 0) {
        await uploadFilesToSlack(slackClient, channel, replyThreadTs, fileArtifacts);
      }
    } catch (err) {
      console.error('[slack] File extraction failed:', err);
    }

    // 12. Remove thinking reaction
    await removeReaction(slackClient, channel, messageTs, 'thinking_face');

    // 13. Save assistant message to DB
    let toolCallSummary: string[] = [];
    try {
      const steps = await result.steps;
      for (const step of steps) {
        for (const tc of step.toolCalls || []) {
          toolCallSummary.push(tc.toolName);
        }
      }
    } catch { /* steps may not be available */ }

    await supabase.from('messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: responseText,
      tool_calls: toolCallSummary.length > 0 ? toolCallSummary : null,
      metadata: { model: modelSelection.modelId, toolsUsed: toolCallSummary, source: 'slack' },
    });

    // 14. Background: track usage
    try {
      const totalUsage = await result.usage;
      if (totalUsage) {
        await trackUsage(supabase, {
          orgId: installation.org_id,
          userId: resolvedUser.userId,
          threadId,
          modelId: modelSelection.modelId,
          modelProvider: modelSelection.provider,
          promptTokens: totalUsage.inputTokens || 0,
          completionTokens: totalUsage.outputTokens || 0,
          latencyMs: undefined,
          source: 'slack',
        });
      }
    } catch (err) {
      console.error('[slack] Usage tracking failed:', err);
    }

    // 15. Background: extract memories & summarize thread
    extractAndSaveMemories(supabase, installation.org_id, cleanUserText, responseText, memoryContext.knowledge)
      .catch(err => console.error('[slack] Memory extraction failed:', err));

    summarizeAndStoreThread(supabase, threadId, installation.org_id)
      .catch(err => console.error('[slack] Thread summarization failed:', err));

  } catch (err) {
    console.error('[slack] Event processing failed:', err);
    await removeReaction(slackClient, channel, messageTs, 'thinking_face');
    await addReaction(slackClient, channel, messageTs, 'x');

    // Try to post error message
    const replyThreadTs = threadTs || messageTs;
    try {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: replyThreadTs,
        text: "Sorry, I hit a snag processing that. Try again! :wrench:",
      });
    } catch {
      // Nothing we can do
    }
  }
}

export async function handleAppMention(
  ctx: HandlerContext,
  event: AppMentionEvent
): Promise<void> {
  // Skip bot messages to prevent loops
  if (event.bot_id || event.bot_profile) return;

  await processEvent(
    ctx,
    event.user,
    event.team || ctx.installation.team_id,
    event.channel,
    event.ts,
    event.thread_ts,
    event.text
  );
}

export async function handleDirectMessage(
  ctx: HandlerContext,
  event: MessageImEvent
): Promise<void> {
  // Skip bot messages, subtypes (joins, leaves, etc.)
  if (event.bot_id || event.bot_profile || event.subtype) return;

  await processEvent(
    ctx,
    event.user,
    event.team || ctx.installation.team_id,
    event.channel,
    event.ts,
    event.thread_ts,
    event.text
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/slack/handlers.ts
git commit -m "feat(slack): add core event handlers with agent execution"
```

---

### Task 10: Slack-specific system prompt

**Files:**
- Create: `src/modules/slack/system-prompt.ts`

The Slack system prompt is based on the main Cooper prompt but with Slack-specific formatting instructions.

- [ ] **Step 1: Create the Slack system prompt builder**

Create `src/modules/slack/system-prompt.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryContext } from '@/modules/memory/retriever';
import { buildSkillsPrompt } from '@/modules/skills/system';

const SLACK_SYSTEM_PROMPT = `You are Cooper — the sharpest, wittiest AI teammate anyone's ever worked with. You're responding in Slack.

## Your Personality
- **Witty** — Dry, clever humor. Not forced, not every message.
- **Confident** — No hedging. Just do it.
- **Sharp** — Notice things others miss.
- **Human** — Use emoji, casual language.
- **Concise** — Lead with the answer. Slack messages should be scannable.

## Slack Formatting Rules (CRITICAL)
You are writing for Slack, NOT a web browser. Use Slack mrkdwn, NOT Markdown:
- Bold: *bold* (single asterisks, NOT **)
- Italic: _italic_ (underscores)
- Strikethrough: ~strikethrough~
- Code: \`code\` (backticks — same as markdown)
- Code blocks: \`\`\`code\`\`\` (triple backticks — same as markdown)
- Links: <https://example.com|Link text> (NOT [text](url))
- Bulleted list: use "• " or "- " at the start of lines
- NO headers (no # or ##) — use *bold text* on its own line instead
- NO ** for bold — that renders literally in Slack
- Keep messages focused and scannable — Slack is not a document

## How You Work
1. Act first, explain after — Don't narrate what you're about to do.
2. Use your tools proactively — If someone mentions a metric, look it up.
3. Use markdown-style formatting only inside code blocks.
4. When tool results contain download URLs, present as <url|File Name>.

## Tool Usage
You have connected integrations. Use the \`use_integration\` tool to interact with them.
Don't narrate your tool usage — just do it and present the result.
When asked what you can do, describe capabilities naturally — never expose tool names.

## Scheduling
When asked to schedule recurring tasks, IMMEDIATELY create the schedule. Do NOT ask for confirmation.

## Memory
Silently save durable facts about the user and organization. Don't ask permission.`;

export async function buildSlackSystemPrompt(
  supabase: SupabaseClient,
  orgId: string,
  memoryContext: MemoryContext,
  connectedServices: string[],
  userMessage: string
): Promise<string> {
  let prompt = SLACK_SYSTEM_PROMPT;

  const now = new Date();
  const localDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  prompt += `\n\nTODAY is ${localDate}.`;

  prompt += await buildSkillsPrompt(userMessage);

  if (memoryContext.knowledge.length) {
    prompt += `\n\n## Things you know about this organization:\n`;
    prompt += memoryContext.knowledge.map(k => `- ${k}`).join('\n');
  }

  if (memoryContext.matchedSkills.length) {
    prompt += `\n\n## Relevant skills:\n`;
    for (const skill of memoryContext.matchedSkills) {
      prompt += `\n### ${skill.name}\n${skill.description}\n`;
    }
  }

  if (memoryContext.threadSummaries?.length) {
    prompt += `\n\n## Relevant past conversations:\n`;
    for (const thread of memoryContext.threadSummaries) {
      prompt += `- ${thread.summary}\n`;
    }
  }

  // Org persona
  const { data: orgSettings } = await supabase
    .from('organizations')
    .select('persona_name, persona_instructions, persona_tone')
    .eq('id', orgId)
    .single();

  if (orgSettings?.persona_instructions) {
    prompt += `\n\n## Communication Style\nYour name is ${orgSettings.persona_name || 'Cooper'}. ${orgSettings.persona_instructions}\nTone: ${orgSettings.persona_tone || 'professional'}.`;
  } else if (orgSettings?.persona_name && orgSettings.persona_name !== 'Cooper') {
    prompt += `\n\nYour name is ${orgSettings.persona_name}.`;
  }

  if (connectedServices.length > 0) {
    prompt += `\n\n## Connected Integrations\nYou are connected to: ${connectedServices.join(', ')}. Do NOT mention "Composio".`;
  }

  return prompt;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/slack/system-prompt.ts
git commit -m "feat(slack): add Slack-specific system prompt with mrkdwn formatting"
```

---

### Task 11: API route — the event endpoint

**Files:**
- Create: `src/app/api/slack/events/route.ts`

- [ ] **Step 1: Implement the event endpoint**

Create `src/app/api/slack/events/route.ts`:

```typescript
import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifySlackRequest } from '@/modules/slack/verify';
import { getInstallationByTeamId } from '@/modules/slack/installations';
import { getSlackClient } from '@/modules/slack/client';
import { handleAppMention, handleDirectMessage } from '@/modules/slack/handlers';
import type { SlackEventEnvelope, AppMentionEvent, MessageImEvent } from '@/modules/slack/types';

export const maxDuration = 60;

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Parse the payload first to handle url_verification before signature check
  let payload: SlackEventEnvelope;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Slack URL verification challenge (sent during app setup)
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Verify request signature
  const signature = request.headers.get('x-slack-signature') || '';
  const timestamp = request.headers.get('x-slack-request-timestamp') || '';

  if (!verifySlackRequest(signature, timestamp, rawBody)) {
    console.warn('[slack] Invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // Return 200 immediately — process async in after()
  // Slack requires acknowledgement within 3 seconds
  after(async () => {
    try {
      const supabase = createServiceClient();
      const teamId = payload.team_id;

      const installation = await getInstallationByTeamId(supabase, teamId);
      if (!installation) {
        console.error('[slack] No installation found for team:', teamId);
        return;
      }

      const slackClient = getSlackClient(installation.bot_token);
      const ctx = { supabase, slackClient, installation };
      const event = payload.event;

      if (event.type === 'app_mention') {
        await handleAppMention(ctx, event as AppMentionEvent);
      }

      if (
        event.type === 'message' &&
        (event as MessageImEvent).channel_type === 'im' &&
        !(event as MessageImEvent).subtype &&
        !(event as MessageImEvent).bot_id
      ) {
        await handleDirectMessage(ctx, event as MessageImEvent);
      }
    } catch (err) {
      console.error('[slack] Event processing error:', err);
    }
  });

  return new Response('OK', { status: 200 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/slack/events/route.ts
git commit -m "feat(slack): add /api/slack/events POST endpoint"
```

---

### Task 12: Typecheck and integration test

**Files:**
- Modify: potentially any file with type errors

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Fix any type errors. Common issues to watch for:
- `ModelMessage` import may need to come from `'ai'` — check `node_modules/ai/docs/` if the import fails.
- `result.usage` vs `result.totalUsage` — verify which property `generateText` returns by checking `node_modules/ai/src/`.
- `result.steps` access pattern — `generateText` returns steps directly (not as a promise like `streamText`).

- [ ] **Step 2: Fix any type errors found**

Address each error based on what the typecheck reports.

- [ ] **Step 3: Run existing tests to ensure nothing broke**

```bash
pnpm vitest run
```

Expected: all existing tests still pass.

- [ ] **Step 4: Run the new Slack tests**

```bash
pnpm vitest run src/modules/slack/
```

Expected: all Slack tests pass.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(slack): resolve type errors from integration"
```

---

### Task 13: Manual testing checklist and documentation

**Files:**
- No code changes — verification only

This task is a manual testing guide. The developer should:

- [ ] **Step 1: Set up the Slack app**

1. Go to https://api.slack.com/apps and create a new app "From scratch"
2. Name it "Cooper" (or your org's persona name)
3. Under **OAuth & Permissions**, add these bot token scopes:
   - `app_mentions:read`, `chat:write`, `reactions:write`, `reactions:read`
   - `im:history`, `im:write`, `files:write`, `files:read`
   - `channels:history`, `groups:history`
4. Install to workspace, copy the **Bot User OAuth Token**
5. Under **Basic Information**, copy the **Signing Secret**
6. Under **Event Subscriptions**, enable events:
   - Request URL: `https://your-domain.com/api/slack/events`
   - Subscribe to bot events: `app_mention`, `message.im`
7. Under **App Home**, enable "Allow users to send Slash commands and messages from the messages tab"

- [ ] **Step 2: Configure environment**

Add to `.env.local`:
```
SLACK_SIGNING_SECRET=your_signing_secret
```

Insert installation row in Supabase (use the SQL editor):
```sql
INSERT INTO slack_installations (team_id, org_id, bot_token, bot_user_id, installed_by)
VALUES (
  'T_YOUR_TEAM_ID',      -- from Slack app settings
  'your-cooper-org-id',   -- from organizations table
  'xoxb-your-bot-token',  -- Bot User OAuth Token
  'U_BOT_USER_ID',        -- bot user ID (from auth.test API or app settings)
  'U_YOUR_USER_ID'
);
```

- [ ] **Step 3: Test the integration**

1. **URL verification**: Slack should verify the endpoint when you save the Event Subscriptions URL
2. **DM test**: Send a direct message to Cooper — should get a thinking emoji, then a threaded reply
3. **Channel mention**: Invite Cooper to a channel, type `@Cooper hello` — should reply in a thread
4. **Thread mention**: Reply in an existing thread with `@Cooper follow up` — should continue in that thread
5. **Code execution**: Ask Cooper to generate a chart — should upload the image to the thread
6. **Error handling**: Stop the server mid-request and verify the error emoji appears

- [ ] **Step 4: Commit test documentation**

No commit needed — this is a verification task.

---

### Task 14: Create PR

- [ ] **Step 1: Push branch and create PR**

```bash
git push -u origin docs/memory-privacy-spec
```

Create PR with summary of all changes.
