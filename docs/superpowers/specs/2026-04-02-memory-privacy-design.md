# Memory Privacy — Personal, Org, and Private Scopes

> Design spec for multi-level memory privacy. Approved 2026-04-02.

## Overview

All knowledge, skills, and memory in Cooper now have a privacy scope. Three levels:

| Scope | Who sees it | Extraction | Default for |
|-------|------------|-----------|-------------|
| **Team** | Everyone in the org | Auto-extract, classified as org | Web chat threads, Slack channels |
| **Personal** | Only the user who created it | Auto-extract, classified as personal | Slack DMs with Cooper |
| **Private** | Nobody | No extraction at all | User-toggled sensitive threads |

## Thread Privacy Toggle

A lock icon in the chat header cycles through: **Team → Personal → Private**.

- **Team** (default for web chat, Slack channels) — Knowledge extracted and shared org-wide
- **Personal** — Knowledge extracted but scoped to the user only
- **Private** — No knowledge extraction, no thread summary, no skill learning. Cooper still responds normally but doesn't remember anything from this conversation.

Changing the toggle mid-conversation:
- Applies from that point forward
- Does NOT retroactively delete already-extracted knowledge
- Cooper acknowledges the change: "Got it — this conversation is now private. I won't remember anything from here."

### Future: Slack Integration Defaults
- **Slack DMs with Cooper** → default to **Personal**
- **Slack channels** → default to **Team**
- **Slack group DMs** → default to **Personal**
- Users can still override via a Slack command (e.g., `/cooper private`)

## Database Changes

### Migration: Add scope to knowledge, skills, thread_summaries

```sql
-- Add privacy scope to knowledge
ALTER TABLE public.knowledge ADD COLUMN scope text NOT NULL DEFAULT 'org'
  CHECK (scope IN ('org', 'personal'));
ALTER TABLE public.knowledge ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
CREATE INDEX idx_knowledge_user_scope ON public.knowledge(user_id, scope) WHERE scope = 'personal';

-- Add privacy scope to skills
ALTER TABLE public.skills ADD COLUMN scope text NOT NULL DEFAULT 'org'
  CHECK (scope IN ('org', 'personal'));
ALTER TABLE public.skills ADD COLUMN scope_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;
CREATE INDEX idx_skills_user_scope ON public.skills(scope_user_id, scope) WHERE scope = 'personal';

-- Add privacy scope to thread summaries
ALTER TABLE public.thread_summaries ADD COLUMN scope text NOT NULL DEFAULT 'org'
  CHECK (scope IN ('org', 'personal'));
ALTER TABLE public.thread_summaries ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

-- Add privacy level to threads
ALTER TABLE public.threads ADD COLUMN privacy text NOT NULL DEFAULT 'team'
  CHECK (privacy IN ('team', 'personal', 'private'));
```

### RLS Updates

Update retrieval RPC functions to filter by scope:
- `match_knowledge` — returns org-scoped items + personal items where `user_id = auth.uid()`
- `match_skills` — same pattern
- `match_thread_summaries` — same pattern

Personal items from other users are NEVER returned.

## Retrieval Changes

### `src/modules/memory/retriever.ts`

Update `retrieveContext()` to accept `userId` and pass it to RPC functions:

```typescript
export async function retrieveContext(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,  // NEW
  userMessage: string
): Promise<MemoryContext> {
  // ...
  const knowledgeResult = await supabase.rpc('match_knowledge', {
    query_embedding: queryEmbedding,
    match_org_id: orgId,
    match_user_id: userId,  // NEW — returns org + personal for this user
    match_count: 5,
    match_threshold: 0.65,
  });
  // ... same for skills and thread_summaries
}
```

### Updated RPC: `match_knowledge`

```sql
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding vector(768),
  match_org_id uuid,
  match_user_id uuid,  -- NEW
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.65
)
RETURNS TABLE(...) AS $$
BEGIN
  RETURN QUERY
  SELECT ...
  FROM public.knowledge k
  WHERE k.org_id = match_org_id
    AND (k.scope = 'org' OR (k.scope = 'personal' AND k.user_id = match_user_id))
    AND 1 - (k.embedding <=> query_embedding) > match_threshold
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## Extraction Changes

### `src/modules/memory/extractor.ts`

When extracting facts from a conversation:

1. **Check thread privacy level** — if `private`, skip extraction entirely
2. **Classify each fact** — add `scope` field to the LLM extraction prompt:

```
For each fact, classify its scope:
- "org" — relevant to the whole team (processes, tool configs, project info)
- "personal" — specific to this individual (preferences, working style, personal context)

Examples:
- "Sprint cycle is 2 weeks" → org
- "I prefer bullet points over paragraphs" → personal
- "The PostHog project ID is abc123" → org
- "I'm working on the auth refactor this week" → personal
- "Our team standup is at 9am" → org
- "I like to review PRs in the morning" → personal
```

3. **Store with scope and user_id** — personal facts get `user_id` set

### Thread summary extraction

- **Team threads** → summary stored as `scope: 'org'`
- **Personal threads** → summary stored as `scope: 'personal'` with `user_id`
- **Private threads** → no summary stored

## UI Changes

### Thread Header Toggle

New component in the chat header showing the current privacy level:

- **Team** — Globe icon, "Team" label
- **Personal** — User icon, "Personal" label
- **Private** — Lock icon, "Private" label

Click cycles through levels. Shows a brief toast confirming the change.

### Knowledge Page

Update the knowledge page to show:
- **Tab: "Team"** — org-scoped knowledge (visible to everyone)
- **Tab: "Personal"** — user's personal knowledge (only visible to them)
- Personal knowledge items show a user icon badge

### Skills Page

Same treatment — skills have a scope indicator.

## System Prompt

Add to the system prompt when thread is personal or private:

```
## This Conversation
This is a [personal/private] conversation.
[Personal]: I'll remember things you share, but only for you — not the team.
[Private]: I won't remember anything from this conversation.
```

## What's NOT in Scope

- Retroactive reclassification of existing knowledge (all existing = org, as-is)
- Per-message privacy (scope is per-thread, not per-message)
- Admin ability to see personal knowledge (respects user privacy)
- Encryption at rest (relies on Supabase RLS, not field-level encryption)
