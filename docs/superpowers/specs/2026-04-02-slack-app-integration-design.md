# Slack App Integration Design

## Overview

A Slack app that lets users interact with Cooper directly in Slack via DMs and @mentions. It runs as a Next.js API route (`/api/slack/events`) within the existing app, reusing the agent engine, tools, memory, and org context.

One Slack workspace maps to one Cooper org. All users in a workspace share the same org context (knowledge, skills, connections).

## Slack App Configuration

### Bot Token Scopes

- `app_mentions:read` — detect @Cooper mentions
- `chat:write` — post messages
- `reactions:write` — add thinking emoji
- `reactions:read` — manage reactions
- `im:history` — read DM history
- `im:write` — send DMs
- `files:write` — upload files/images
- `files:read` — access shared files
- `channels:history` — read channel messages for thread context
- `groups:history` — read private channel messages for thread context

### Event Subscriptions

- `app_mention` — when someone @mentions Cooper
- `message.im` — when someone DMs Cooper

No auto-join behavior. Cooper only participates in channels when explicitly invited and mentioned.

## Architecture

```
Slack Event (POST) -> /api/slack/events
  |-- Signature verification
  |-- url_verification challenge handling
  |-- Return 200 immediately (Slack 3s timeout)
  +-- after() async processing:
       |-- Add thinking reaction to user's message
       |-- Resolve Slack workspace -> Cooper org
       |-- Resolve Slack user -> Cooper user (or auto-provision)
       |-- Determine conversation:
       |    |-- New DM message -> create thread, reply in Slack thread
       |    |-- @mention not in thread -> create thread, reply in Slack thread
       |    +-- @mention in thread -> find/create thread for that Slack thread
       |-- Load thread history from Slack (for thread context)
       |-- Call createAgentStream() with org context
       |-- Await full response (generateText, not streamText)
       |-- Post response to Slack thread (with files if needed)
       +-- Remove thinking reaction, save message to DB
```

### Why `generateText` instead of `streamText`

For the Slack integration, we use `generateText` instead of `streamText` because we post the complete response as a single message. There is no streaming UI to feed tokens into. The thinking emoji reaction signals that Cooper is working.

## Data Model

### `slack_installations` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `team_id` | text, unique | Slack workspace ID |
| `org_id` | uuid, FK -> organizations | |
| `bot_token` | text | Bot User OAuth Token |
| `bot_user_id` | text | Cooper's Slack user ID |
| `installed_by` | text | Slack user ID who installed |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `slack_user_mappings` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `slack_user_id` | text | |
| `slack_team_id` | text | |
| `user_id` | uuid, FK -> users | |
| `org_id` | uuid, FK -> organizations | |
| `created_at` | timestamptz | |

Unique constraint on `(slack_user_id, slack_team_id)`.

### `slack_thread_mappings` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | |
| `slack_channel_id` | text | |
| `slack_thread_ts` | text | Parent message ts |
| `thread_id` | uuid, FK -> threads | |
| `org_id` | uuid, FK -> organizations | |
| `created_at` | timestamptz | |

Unique constraint on `(slack_channel_id, slack_thread_ts)`.

## Conversation Flow

### DM to Cooper

1. User sends a message in Cooper's DM
2. Event arrives as `message.im` with no `thread_ts`
3. Create a new Cooper thread, post reply in a Slack thread (using the user's message `ts` as `thread_ts`)
4. Store the mapping in `slack_thread_mappings`
5. Subsequent messages in that Slack thread hit the existing mapping and continue the same Cooper thread

### DM follow-up in thread

1. User replies in an existing Slack DM thread
2. Event arrives as `message.im` with `thread_ts`
3. Look up `slack_thread_mappings` for this channel + thread_ts
4. If found: append to existing Cooper thread
5. If not found: create new Cooper thread, store mapping
6. Fetch Slack thread history for context

### @mention in a channel (not in a thread)

1. Event arrives as `app_mention` with no `thread_ts`
2. Same flow as a new DM: create Cooper thread, reply in Slack thread off the original message
3. Store mapping

### @mention in an existing thread

1. Event arrives as `app_mention` with `thread_ts`
2. Look up `slack_thread_mappings` for this channel + thread_ts
3. If found: append to existing Cooper thread
4. If not found: create new Cooper thread, store mapping
5. Fetch Slack thread history for context

## Thread Context

When replying in an existing thread, fetch history via Slack's `conversations.replies` API and convert to AI SDK message format:

- Bot messages (matching `bot_user_id`) -> `assistant` role
- All other messages -> `user` role (prefixed with the user's display name for clarity)
- Strip `<@BOT_USER_ID>` mentions from text so the agent doesn't see its own @tag

This gives the agent full conversational context from Slack without duplicating every Slack message in our DB. We still save the Cooper thread's messages (user input + assistant response) to our DB for memory/summarization.

## Thinking Emoji

1. Immediately after receiving the event, add a `thinking_face` reaction to the user's message via `reactions.add`
2. When the response is ready and posted, remove it via `reactions.remove`
3. If processing fails, remove `thinking_face` and add `x` reaction

## File Handling

### Outbound (Cooper -> Slack)

- **Small files** (images from code execution, CSVs, < 5MB): Upload directly via `files.uploadV2` into the Slack thread
- **Large files / interactive artifacts**: Post a link to the web app

### Detection

After the agent response completes, scan tool call results for file artifacts (from sandbox execution, workspace file saves, etc.). Extract URLs/content and upload alongside the text response.

## Response Delivery Options

### Current: Post once when complete (Option A)

Wait for the full `generateText` response, then post a single message with `chat.postMessage`.

- **Pros:** Clean output, no flickering, no rate limit concerns, simple error handling
- **Cons:** User waits for full response with only the thinking emoji as feedback

### Future: Post placeholder then edit (Option B)

Post "Thinking..." immediately via `chat.postMessage`, then update with `chat.update` when response is ready.

- **Pros:** User sees immediate textual feedback beyond the emoji
- **Cons:** Two API calls, brief flash of placeholder content

### Future: Stream with periodic edits (Option C)

Post initial message, update every 2-3 seconds via `chat.update` as tokens stream in.

- **Pros:** Most responsive feel, closest to the web experience
- **Cons:** Hits Slack rate limits (~1 update/sec per channel), janky re-rendering as Slack reflows the message, complex error handling for partial updates, higher API usage

## User Resolution

When a Slack event arrives:

1. Look up `slack_user_mappings` by `(slack_user_id, slack_team_id)`
2. If found: use the mapped `user_id` and `org_id`
3. If not found:
   - Look up `slack_installations` by `team_id` to get `org_id`
   - Fetch Slack user profile (email, display name) via `users.info`
   - Create a new entry in `users` table linked to the org
   - Create `slack_user_mappings` entry
   - Auto-provisioned users get `role: 'member'`

## Module Structure

```
src/modules/slack/
  verify.ts          -- Slack request signature verification
  client.ts          -- Slack Web API client factory (from bot_token per workspace)
  events.ts          -- Event type definitions & dispatcher
  handlers.ts        -- app_mention + message.im handlers (core logic)
  threads.ts         -- Thread context fetching & conversion to AI SDK messages
  users.ts           -- Slack user -> Cooper user resolution/provisioning
  files.ts           -- File upload utilities (uploadV2 + link fallback)
  installations.ts   -- Workspace install/uninstall management

src/app/api/slack/
  events/route.ts    -- POST handler for Slack events
```

## Environment Variables

```
SLACK_SIGNING_SECRET    -- For request signature verification
```

Bot tokens are stored per-installation in `slack_installations`, not as env vars. This supports multi-workspace installations.

For the initial implementation, we will manually insert a `slack_installations` row with the bot token from the Slack app dashboard. A full OAuth install flow (`/api/slack/install`) is a future enhancement.

## Security

- Every request is verified via Slack signing secret + timestamp (replay protection within 5 minutes)
- Bot tokens are stored in the DB, accessed via the service-role Supabase client (bypasses RLS)
- Events from bots are filtered out early to prevent infinite loops
- The event handler returns 200 immediately; all processing happens in `after()` to stay within Slack's 3-second acknowledgement window

## Slack Message Formatting

Cooper's responses are converted from markdown to Slack's mrkdwn format before posting:

- `**bold**` -> `*bold*`
- `[text](url)` -> `<url|text>`
- Code blocks remain as-is (Slack supports triple backtick)
- Bullet lists remain as-is

## Error Handling

- If the agent stream fails, post a user-friendly error message in the thread ("Sorry, I hit a snag. Try again!")
- Remove thinking emoji and add error emoji on failure
- Log errors with Slack event context (channel, user, team) for debugging
- If Slack API calls fail (posting, reactions), log but don't retry (Slack may have already shown partial state)

## Dependencies

New npm package: `@slack/web-api` for the Slack Web API client. No Bolt framework needed.

## Out of Scope (Future)

- OAuth install flow (self-serve workspace installation)
- Slash commands (`/cooper`)
- Slack app home tab
- Interactive components (buttons, modals)
- `assistant_thread_started` event / suggested prompts in DMs
- Streaming response updates (Options B and C above)
