# Cooper Phase 3: Memory, Skills & Expanded Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add layered memory (conversation recall, org knowledge, learned skills), a skill system (create/manage/match), and expand connections beyond MCP with Composio as the unified API platform.

**Architecture:** Memory uses pgvector in Supabase behind `VectorStore` and `EmbeddingProvider` interfaces. The memory retriever assembles relevant context before every agent call. Skills are structured definitions stored in Supabase, matched via semantic similarity, and injected into the agent's system prompt. Composio provides OAuth-managed integrations via its SDK, wrapped behind the existing `platform` connection type in the tool registry.

**Tech Stack:** Supabase pgvector, Vercel AI SDK (`ai` embeddings), `@composio/core`, Zod, shadcn UI, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-28-cooper-platform-design.md` — Memory System, Skills System, and Connections sections

---

## File Structure

```
src/
├── modules/
│   ├── memory/
│   │   ├── types.ts              # VectorStore, EmbeddingProvider, VectorEntry interfaces
│   │   ├── embeddings.ts         # EmbeddingProvider implementation (AI SDK)
│   │   ├── vector-store.ts       # VectorStore implementation (Supabase pgvector)
│   │   ├── knowledge.ts          # CRUD for org knowledge facts
│   │   └── retriever.ts          # Assembles context before agent calls
│   │
│   ├── skills/
│   │   ├── types.ts              # Skill, SkillStep interfaces
│   │   ├── db.ts                 # Supabase CRUD for skills
│   │   ├── parser.ts             # NL → structured Skill (uses LLM)
│   │   ├── matcher.ts            # Match incoming message to skills via embeddings
│   │   └── executor.ts           # Inject skill steps into agent context
│   │
│   ├── connections/
│   │   ├── platform/
│   │   │   ├── composio.ts       # Composio client + tool adapter
│   │   │   └── types.ts          # Composio-specific config types
│   │   └── registry.ts           # MODIFY — add platform case
│   │
│   └── agent/
│       ├── engine.ts             # MODIFY — add memory context to system prompt
│       └── types.ts              # MODIFY — add memoryContext to AgentInput
│
├── app/
│   ├── api/
│   │   ├── chat/route.ts         # MODIFY — call retriever before engine
│   │   ├── knowledge/route.ts    # CRUD API for knowledge facts
│   │   ├── skills/route.ts       # CRUD API for skills
│   │   └── connections/
│   │       ├── route.ts          # MODIFY — handle Composio connections
│   │       └── composio/
│   │           └── route.ts      # Composio OAuth callback
│   └── (app)/
│       ├── skills/
│       │   └── page.tsx          # Skill management UI
│       └── knowledge/
│           └── page.tsx          # Knowledge management UI
│
├── components/
│   ├── skills/
│   │   ├── SkillList.tsx         # List of skills
│   │   ├── SkillCard.tsx         # Single skill display
│   │   └── CreateSkillModal.tsx  # NL skill creation
│   └── knowledge/
│       ├── KnowledgeList.tsx     # List of knowledge facts
│       └── AddKnowledgeModal.tsx # Add fact manually
│
└── supabase/
    └── migrations/
        └── 003_memory_skills.sql  # knowledge, skills tables + pgvector
```

---

## Task 1: Database — Knowledge & Skills Tables + pgvector Setup

**Files:**
- Create: `supabase/migrations/003_memory_skills.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/003_memory_skills.sql`:

```sql
-- Ensure pgvector extension exists (created in 001 but safe to repeat)
create extension if not exists vector with schema extensions;

-- Knowledge table — org facts with embeddings
create table public.knowledge (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  content text not null,
  embedding extensions.vector(1536),
  source text not null default 'user' check (source in ('user', 'conversation', 'system')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_knowledge_org_id on public.knowledge(org_id);
create index idx_knowledge_embedding on public.knowledge
  using hnsw (embedding extensions.vector_cosine_ops);

-- Skills table
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null,
  trigger text not null,
  steps jsonb not null default '[]',
  tools text[] not null default '{}',
  output_format text,
  created_by text not null default 'user' check (created_by in ('user', 'cooper')),
  version integer not null default 1,
  enabled boolean not null default true,
  embedding extensions.vector(1536),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_skills_org_id on public.skills(org_id);
create index idx_skills_embedding on public.skills
  using hnsw (embedding extensions.vector_cosine_ops);

-- RLS for knowledge
alter table public.knowledge enable row level security;

create policy "Users can view own org knowledge"
  on public.knowledge for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can insert knowledge in own org"
  on public.knowledge for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org knowledge"
  on public.knowledge for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org knowledge"
  on public.knowledge for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));

-- RLS for skills
alter table public.skills enable row level security;

create policy "Users can view own org skills"
  on public.skills for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can insert skills in own org"
  on public.skills for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own org skills"
  on public.skills for update
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can delete own org skills"
  on public.skills for delete
  using (org_id in (select org_id from public.users where id = auth.uid()));

-- Similarity search function for knowledge
create or replace function public.match_knowledge(
  query_embedding extensions.vector(1536),
  match_org_id uuid,
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id uuid,
  content text,
  source text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    k.id,
    k.content,
    k.source,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge k
  where k.org_id = match_org_id
    and k.embedding is not null
    and 1 - (k.embedding <=> query_embedding) > match_threshold
  order by k.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Similarity search function for skills
create or replace function public.match_skills(
  query_embedding extensions.vector(1536),
  match_org_id uuid,
  match_count int default 3,
  match_threshold float default 0.6
)
returns table (
  id uuid,
  name text,
  description text,
  trigger text,
  steps jsonb,
  tools text[],
  output_format text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    s.id,
    s.name,
    s.description,
    s.trigger,
    s.steps,
    s.tools,
    s.output_format,
    1 - (s.embedding <=> query_embedding) as similarity
  from public.skills s
  where s.org_id = match_org_id
    and s.enabled = true
    and s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) > match_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
end;
$$;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/003_memory_skills.sql
git commit -m "feat: add knowledge and skills tables with pgvector indexes and RLS"
```

---

## Task 2: Embedding Provider + Vector Store

**Files:**
- Create: `src/modules/memory/types.ts`
- Create: `src/modules/memory/embeddings.ts`
- Create: `src/modules/memory/vector-store.ts`

- [ ] **Step 1: Create memory types**

Create `src/modules/memory/types.ts`:

```typescript
export interface VectorEntry {
  id: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  content: string;
}

export interface VectorResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SearchOpts {
  topK: number;
  filter?: Record<string, unknown>;
  minScore?: number;
}

export interface VectorStore {
  upsert(entries: VectorEntry[]): Promise<void>;
  search(query: number[], opts: SearchOpts): Promise<VectorResult[]>;
  delete(ids: string[]): Promise<void>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

- [ ] **Step 2: Create embedding provider**

Create `src/modules/memory/embeddings.ts`:

```typescript
import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import type { EmbeddingProvider } from './types';

class GoogleEmbeddingProvider implements EmbeddingProvider {
  private model = google.textEmbeddingModel('text-embedding-004');

  async embed(text: string): Promise<number[]> {
    const result = await embed({
      model: this.model,
      value: text,
    });
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const result = await embedMany({
      model: this.model,
      values: texts,
    });
    return result.embeddings;
  }
}

export const embeddingProvider: EmbeddingProvider = new GoogleEmbeddingProvider();
```

IMPORTANT: Check that `embed` and `embedMany` are exported from `ai` package. Also check that `google.textEmbeddingModel('text-embedding-004')` is the correct way to get a Google embedding model. The model name might differ. Read the actual types in `node_modules/ai` and `node_modules/@ai-sdk/google` to confirm. The embedding dimension must match the 1536 in the SQL migration — Google's text-embedding-004 produces 768-dimensional vectors. If so, update the SQL migration to use `vector(768)` instead of `vector(1536)`, or switch to an OpenAI embedding model that produces 1536-dim vectors.

Alternative: Use the `@ai-sdk/openai` package with `openai.embedding('text-embedding-3-small')` which produces 1536 dimensions. If using Google, the dimension is 768 and you need to update the migration accordingly.

Decide based on what's available. The key is that the embedding dimension in the code matches the SQL `vector(N)` dimension.

- [ ] **Step 3: Create vector store (Supabase pgvector)**

Create `src/modules/memory/vector-store.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { VectorStore, VectorEntry, VectorResult, SearchOpts } from './types';

export class SupabaseVectorStore implements VectorStore {
  constructor(private supabase: SupabaseClient) {}

  async upsert(entries: VectorEntry[]): Promise<void> {
    for (const entry of entries) {
      const table = this.getTable(entry.metadata.type as string);
      if (!table) continue;

      const { error } = await this.supabase
        .from(table)
        .upsert({
          id: entry.id,
          org_id: entry.metadata.orgId,
          content: entry.content,
          embedding: entry.embedding,
          source: entry.metadata.source || 'user',
          ...(table === 'skills' ? {
            name: entry.metadata.name,
            description: entry.metadata.description,
            trigger: entry.metadata.trigger,
            steps: entry.metadata.steps,
            tools: entry.metadata.tools,
            output_format: entry.metadata.outputFormat,
            created_by: entry.metadata.createdBy,
          } : {}),
        });

      if (error) {
        console.error(`[vector-store] Failed to upsert to ${table}:`, error);
      }
    }
  }

  async search(query: number[], opts: SearchOpts): Promise<VectorResult[]> {
    const type = opts.filter?.type as string;
    const orgId = opts.filter?.orgId as string;

    if (!type || !orgId) return [];

    const rpcName = type === 'knowledge' ? 'match_knowledge' : 'match_skills';

    const { data, error } = await this.supabase.rpc(rpcName, {
      query_embedding: query,
      match_org_id: orgId,
      match_count: opts.topK,
      match_threshold: opts.minScore || 0.6,
    });

    if (error) {
      console.error(`[vector-store] Search failed:`, error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      content: row.content || row.description || '',
      similarity: row.similarity,
      metadata: row,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    // Delete from both tables — only one will match
    await this.supabase.from('knowledge').delete().in('id', ids);
    await this.supabase.from('skills').delete().in('id', ids);
  }

  private getTable(type: string): string | null {
    switch (type) {
      case 'knowledge': return 'knowledge';
      case 'skill': return 'skills';
      default: return null;
    }
  }
}
```

- [ ] **Step 4: Verify it compiles**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/memory/
git commit -m "feat: add embedding provider and vector store with Supabase pgvector"
```

---

## Task 3: Knowledge CRUD + API

**Files:**
- Create: `src/modules/memory/knowledge.ts`
- Create: `src/app/api/knowledge/route.ts`

- [ ] **Step 1: Create knowledge CRUD**

Create `src/modules/memory/knowledge.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from './embeddings';

export interface KnowledgeFact {
  id: string;
  org_id: string;
  content: string;
  source: 'user' | 'conversation' | 'system';
  created_at: string;
  updated_at: string;
}

export async function getKnowledgeForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<KnowledgeFact[]> {
  const { data, error } = await supabase
    .from('knowledge')
    .select('id, org_id, content, source, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[knowledge] Failed to load:', error);
    return [];
  }

  return data as KnowledgeFact[];
}

export async function addKnowledge(
  supabase: SupabaseClient,
  orgId: string,
  content: string,
  source: 'user' | 'conversation' = 'user'
): Promise<KnowledgeFact | null> {
  const embedding = await embeddingProvider.embed(content);

  const { data, error } = await supabase
    .from('knowledge')
    .insert({
      org_id: orgId,
      content,
      source,
      embedding,
    })
    .select('id, org_id, content, source, created_at, updated_at')
    .single();

  if (error) {
    console.error('[knowledge] Failed to add:', error);
    return null;
  }

  return data as KnowledgeFact;
}

export async function deleteKnowledge(
  supabase: SupabaseClient,
  knowledgeId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('knowledge')
    .delete()
    .eq('id', knowledgeId);

  if (error) {
    console.error('[knowledge] Failed to delete:', error);
    return false;
  }
  return true;
}
```

- [ ] **Step 2: Create knowledge API route**

Create `src/app/api/knowledge/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { getKnowledgeForOrg, addKnowledge, deleteKnowledge } from '@/modules/memory/knowledge';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const facts = await getKnowledgeForOrg(supabase, dbUser.org_id);
  return Response.json(facts);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const { content } = await req.json();
  if (!content) return new Response('Missing content', { status: 400 });

  const fact = await addKnowledge(supabase, dbUser.org_id, content);
  if (!fact) return new Response('Failed to add knowledge', { status: 500 });

  return Response.json(fact, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const success = await deleteKnowledge(supabase, id);
  if (!success) return new Response('Failed to delete', { status: 500 });

  return Response.json({ success: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/memory/knowledge.ts src/app/api/knowledge/
git commit -m "feat: add knowledge CRUD with embedding generation"
```

---

## Task 4: Memory Retriever

**Files:**
- Create: `src/modules/memory/retriever.ts`
- Modify: `src/modules/agent/types.ts`
- Modify: `src/modules/agent/engine.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Create the memory retriever**

Create `src/modules/memory/retriever.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from './embeddings';

export interface MemoryContext {
  knowledge: string[];
  matchedSkills: Array<{
    name: string;
    description: string;
    steps: unknown[];
    tools: string[];
    outputFormat?: string;
  }>;
}

export async function retrieveContext(
  supabase: SupabaseClient,
  orgId: string,
  userMessage: string
): Promise<MemoryContext> {
  const context: MemoryContext = {
    knowledge: [],
    matchedSkills: [],
  };

  try {
    const queryEmbedding = await embeddingProvider.embed(userMessage);

    // Fetch knowledge and skills in parallel
    const [knowledgeResult, skillsResult] = await Promise.all([
      supabase.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        match_org_id: orgId,
        match_count: 5,
        match_threshold: 0.65,
      }),
      supabase.rpc('match_skills', {
        query_embedding: queryEmbedding,
        match_org_id: orgId,
        match_count: 3,
        match_threshold: 0.55,
      }),
    ]);

    if (knowledgeResult.data) {
      context.knowledge = knowledgeResult.data.map((k: any) => k.content);
    }

    if (skillsResult.data) {
      context.matchedSkills = skillsResult.data.map((s: any) => ({
        name: s.name,
        description: s.description,
        steps: s.steps,
        tools: s.tools,
        outputFormat: s.output_format,
      }));
    }
  } catch (error) {
    console.error('[retriever] Failed to retrieve context:', error);
  }

  return context;
}
```

- [ ] **Step 2: Update agent types**

Add `memoryContext` to `AgentInput` in `src/modules/agent/types.ts`:

```typescript
import type { MemoryContext } from '@/modules/memory/retriever';

export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  messages: AgentMessage[];
  modelOverride?: string;
  tools?: Record<string, any>;
  memoryContext?: MemoryContext;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
```

- [ ] **Step 3: Update engine to inject memory context into system prompt**

In `src/modules/agent/engine.ts`, modify the `createAgentStream` function to append memory context to the system prompt:

```typescript
// Add this function before createAgentStream:
function buildSystemPrompt(memoryContext?: MemoryContext): string {
  let prompt = SYSTEM_PROMPT;

  if (memoryContext?.knowledge.length) {
    prompt += `\n\n## Things you know about this organization:\n`;
    prompt += memoryContext.knowledge.map((k) => `- ${k}`).join('\n');
  }

  if (memoryContext?.matchedSkills.length) {
    prompt += `\n\n## Relevant skills you've learned:\n`;
    for (const skill of memoryContext.matchedSkills) {
      prompt += `\n### ${skill.name}\n${skill.description}\n`;
      if (skill.steps && Array.isArray(skill.steps)) {
        prompt += `Steps:\n`;
        skill.steps.forEach((step: any, i: number) => {
          prompt += `${i + 1}. ${step.action}`;
          if (step.toolName) prompt += ` (use tool: ${step.toolName})`;
          prompt += `\n`;
        });
      }
      if (skill.outputFormat) {
        prompt += `Output format: ${skill.outputFormat}\n`;
      }
    }
  }

  return prompt;
}
```

Then in `createAgentStream`, replace `system: SYSTEM_PROMPT` with `system: buildSystemPrompt(input.memoryContext)`.

Add the `MemoryContext` import at the top:
```typescript
import type { MemoryContext } from '@/modules/memory/retriever';
```

- [ ] **Step 4: Update chat API route to call retriever**

In `src/app/api/chat/route.ts`, add retriever call before creating the agent stream.

Add import:
```typescript
import { retrieveContext } from '@/modules/memory/retriever';
```

After loading tools and before `createAgentStream`, add:
```typescript
  // Retrieve memory context
  const lastMessage = messages[messages.length - 1];
  const userText = lastMessage?.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('') || '';

  const memoryContext = await retrieveContext(supabase, dbUser.org_id, userText);
```

Then pass it to the agent:
```typescript
  const result = createAgentStream({
    ...agentInput,
    tools,
    memoryContext,
  });
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm build
git add src/modules/memory/retriever.ts src/modules/agent/ src/app/api/chat/
git commit -m "feat: add memory retriever with knowledge and skill context injection"
```

---

## Task 5: Skills CRUD + API

**Files:**
- Create: `src/modules/skills/types.ts`
- Create: `src/modules/skills/db.ts`
- Create: `src/app/api/skills/route.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create skill types**

Create `src/modules/skills/types.ts`:

```typescript
export interface Skill {
  id: string;
  org_id: string;
  name: string;
  description: string;
  trigger: string;
  steps: SkillStep[];
  tools: string[];
  output_format: string | null;
  created_by: 'user' | 'cooper';
  version: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillStep {
  action: string;
  toolName?: string;
  params?: Record<string, unknown>;
  condition?: string;
}
```

- [ ] **Step 2: Add Skill to shared types**

Add to the bottom of `src/lib/types.ts`:

```typescript
export interface Skill {
  id: string;
  org_id: string;
  name: string;
  description: string;
  trigger: string;
  steps: Array<{
    action: string;
    toolName?: string;
    params?: Record<string, unknown>;
    condition?: string;
  }>;
  tools: string[];
  output_format: string | null;
  created_by: 'user' | 'cooper';
  version: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Create skills DB layer**

Create `src/modules/skills/db.ts`:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import { embeddingProvider } from '@/modules/memory/embeddings';
import type { Skill } from '@/lib/types';

export async function getSkillsForOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<Skill[]> {
  const { data, error } = await supabase
    .from('skills')
    .select('id, org_id, name, description, trigger, steps, tools, output_format, created_by, version, enabled, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[skills] Failed to load:', error);
    return [];
  }

  return data as Skill[];
}

export async function createSkill(
  supabase: SupabaseClient,
  skill: {
    org_id: string;
    name: string;
    description: string;
    trigger: string;
    steps: Skill['steps'];
    tools: string[];
    output_format?: string;
    created_by: 'user' | 'cooper';
  }
): Promise<Skill | null> {
  // Generate embedding from description + trigger for matching
  const embeddingText = `${skill.name}: ${skill.description}. Trigger: ${skill.trigger}`;
  const embedding = await embeddingProvider.embed(embeddingText);

  const { data, error } = await supabase
    .from('skills')
    .insert({
      ...skill,
      embedding,
    })
    .select('id, org_id, name, description, trigger, steps, tools, output_format, created_by, version, enabled, created_at, updated_at')
    .single();

  if (error) {
    console.error('[skills] Failed to create:', error);
    return null;
  }

  return data as Skill;
}

export async function updateSkill(
  supabase: SupabaseClient,
  skillId: string,
  updates: Partial<Pick<Skill, 'name' | 'description' | 'trigger' | 'steps' | 'tools' | 'output_format' | 'enabled'>>
): Promise<Skill | null> {
  // Re-embed if description or trigger changed
  let embedding: number[] | undefined;
  if (updates.description || updates.trigger || updates.name) {
    const { data: existing } = await supabase
      .from('skills').select('name, description, trigger').eq('id', skillId).single();
    if (existing) {
      const name = updates.name || existing.name;
      const desc = updates.description || existing.description;
      const trig = updates.trigger || existing.trigger;
      embedding = await embeddingProvider.embed(`${name}: ${desc}. Trigger: ${trig}`);
    }
  }

  const { data, error } = await supabase
    .from('skills')
    .update({
      ...updates,
      ...(embedding ? { embedding } : {}),
      version: supabase.rpc ? undefined : undefined, // version bump handled below
      updated_at: new Date().toISOString(),
    })
    .eq('id', skillId)
    .select('id, org_id, name, description, trigger, steps, tools, output_format, created_by, version, enabled, created_at, updated_at')
    .single();

  if (error) {
    console.error('[skills] Failed to update:', error);
    return null;
  }

  // Bump version separately since Supabase doesn't support column references in update
  if (data) {
    await supabase
      .from('skills')
      .update({ version: (data as Skill).version + 1 })
      .eq('id', skillId);
  }

  return data as Skill;
}

export async function deleteSkill(
  supabase: SupabaseClient,
  skillId: string
): Promise<boolean> {
  const { error } = await supabase.from('skills').delete().eq('id', skillId);
  if (error) {
    console.error('[skills] Failed to delete:', error);
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Create skills API route**

Create `src/app/api/skills/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { getSkillsForOrg, createSkill, deleteSkill } from '@/modules/skills/db';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const skills = await getSkillsForOrg(supabase, dbUser.org_id);
  return Response.json(skills);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const body = await req.json();
  const { name, description, trigger, steps, tools, output_format } = body;

  if (!name || !description || !trigger) {
    return new Response('Missing required fields', { status: 400 });
  }

  const skill = await createSkill(supabase, {
    org_id: dbUser.org_id,
    name,
    description,
    trigger,
    steps: steps || [],
    tools: tools || [],
    output_format,
    created_by: 'user',
  });

  if (!skill) return new Response('Failed to create skill', { status: 500 });
  return Response.json(skill, { status: 201 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const success = await deleteSkill(supabase, id);
  if (!success) return new Response('Failed to delete', { status: 500 });
  return Response.json({ success: true });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/skills/ src/app/api/skills/ src/lib/types.ts
git commit -m "feat: add skills CRUD with embedding generation and API"
```

---

## Task 6: NL Skill Parser

**Files:**
- Create: `src/modules/skills/parser.ts`

- [ ] **Step 1: Create the NL skill parser**

Create `src/modules/skills/parser.ts`:

```typescript
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const skillSchema = z.object({
  name: z.string().describe('Short name for the skill'),
  description: z.string().describe('What this skill does'),
  trigger: z.string().describe('When this skill should activate'),
  steps: z.array(z.object({
    action: z.string().describe('What this step does'),
    toolName: z.string().optional().describe('Tool to use, if any'),
    condition: z.string().optional().describe('When to execute this step'),
  })).describe('Ordered steps to execute'),
  tools: z.array(z.string()).describe('List of tool names this skill uses'),
  outputFormat: z.string().optional().describe('Expected output format'),
});

export type ParsedSkill = z.infer<typeof skillSchema>;

export async function parseSkillFromNL(
  userDescription: string,
  availableTools: string[]
): Promise<ParsedSkill> {
  const result = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: skillSchema,
    prompt: `Parse the following natural language description into a structured skill definition.

Available tools: ${availableTools.join(', ') || 'none connected yet'}

User's description:
"${userDescription}"

Create a structured skill with a name, description, trigger condition, ordered steps (with tool names where applicable), and expected output format.`,
  });

  return result.object;
}
```

IMPORTANT: Check that `generateObject` is exported from `ai` package and works with the Google provider. Read the types to confirm. If not available, use `generateText` with a JSON output instruction and parse manually.

- [ ] **Step 2: Verify and commit**

```bash
pnpm build
git add src/modules/skills/parser.ts
git commit -m "feat: add NL skill parser using structured output generation"
```

---

## Task 7: Composio Integration

**Files:**
- Create: `src/modules/connections/platform/types.ts`
- Create: `src/modules/connections/platform/composio.ts`
- Modify: `src/modules/connections/registry.ts`

- [ ] **Step 1: Install Composio SDK**

```bash
pnpm add composio-core
```

IMPORTANT: The package name might be `@composio/core` or `composio-core`. Check npm to find the correct package name. Install the correct one.

- [ ] **Step 2: Create Composio types**

Create `src/modules/connections/platform/types.ts`:

```typescript
export interface ComposioConnectionConfig {
  apiKey: string;
  entityId: string; // maps to the org/user in Composio
  apps: string[];   // e.g., ['github', 'linear', 'slack']
}
```

- [ ] **Step 3: Create Composio client adapter**

Create `src/modules/connections/platform/composio.ts`:

```typescript
import { ComposioToolSet } from 'composio-core';
import type { ComposioConnectionConfig } from './types';

// Cache toolsets by connection ID
const toolsetCache = new Map<string, { toolset: ComposioToolSet; createdAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getComposioTools(
  connectionId: string,
  config: ComposioConnectionConfig
): Promise<Record<string, any>> {
  const cached = toolsetCache.get(connectionId);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    try {
      const tools = await cached.toolset.getTools({ apps: config.apps });
      return toolsToRecord(tools);
    } catch {
      toolsetCache.delete(connectionId);
    }
  }

  try {
    const toolset = new ComposioToolSet({
      apiKey: config.apiKey,
      entityId: config.entityId,
    });

    toolsetCache.set(connectionId, { toolset, createdAt: Date.now() });

    const tools = await toolset.getTools({ apps: config.apps });
    return toolsToRecord(tools);
  } catch (error) {
    console.error(`[composio] Failed to get tools:`, error);
    return {};
  }
}

function toolsToRecord(tools: any[]): Record<string, any> {
  const record: Record<string, any> = {};
  for (const tool of tools) {
    record[tool.name || tool.function?.name || 'unknown'] = tool;
  }
  return record;
}

export function clearComposioCache(connectionId?: string): void {
  if (connectionId) {
    toolsetCache.delete(connectionId);
  } else {
    toolsetCache.clear();
  }
}
```

IMPORTANT: Check the actual Composio SDK API. The package might export differently. Read `node_modules/composio-core` (or whatever the package is) to confirm:
- How to create a toolset/client
- How to get tools for specific apps
- What format tools come in — they may need conversion to AI SDK tool format
- How to handle auth — Composio may have its own auth flow for connecting user accounts

Adapt the code to match the actual API. The key requirement: `getComposioTools` returns a `Record<string, any>` compatible with the AI SDK's `tools` parameter in `streamText`.

- [ ] **Step 4: Update registry to handle platform connections**

In `src/modules/connections/registry.ts`, update the `platform` case:

Add import:
```typescript
import { getComposioTools } from './platform/composio';
import type { ComposioConnectionConfig } from './platform/types';
```

Replace the `platform` case:
```typescript
    case 'platform':
      return getComposioTools(conn.id, conn.config as unknown as ComposioConnectionConfig);
```

- [ ] **Step 5: Verify and commit**

```bash
pnpm build
git add src/modules/connections/platform/ src/modules/connections/registry.ts package.json pnpm-lock.yaml
git commit -m "feat: add Composio platform adapter for OAuth-managed integrations"
```

---

## Task 8: Knowledge Management UI

**Files:**
- Create: `src/components/knowledge/KnowledgeList.tsx`
- Create: `src/components/knowledge/AddKnowledgeModal.tsx`
- Create: `src/app/(app)/knowledge/page.tsx`
- Modify: `src/components/chat/ChatSidebar.tsx`

- [ ] **Step 1: Create AddKnowledgeModal**

Create `src/components/knowledge/AddKnowledgeModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface AddKnowledgeModalProps {
  opened: boolean;
  onClose: () => void;
  onAdd: (content: string) => void;
}

export function AddKnowledgeModal({ opened, onClose, onAdd }: AddKnowledgeModalProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    await onAdd(content.trim());
    setLoading(false);
    setContent('');
    onClose();
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Knowledge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Textarea
            placeholder="e.g., Our sprint cycle is 2 weeks starting Monday. Deploy process requires PR approval from 2 reviewers."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Adding...' : 'Add knowledge'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create KnowledgeList**

Create `src/components/knowledge/KnowledgeList.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { AddKnowledgeModal } from './AddKnowledgeModal';

interface KnowledgeFact {
  id: string;
  content: string;
  source: string;
  created_at: string;
}

export function KnowledgeList() {
  const [facts, setFacts] = useState<KnowledgeFact[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadFacts() {
    const res = await fetch('/api/knowledge');
    if (res.ok) setFacts(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadFacts(); }, []);

  const handleAdd = async (content: string) => {
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) await loadFacts();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE' });
    if (res.ok) setFacts((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Knowledge</h2>
            <p className="text-sm text-muted-foreground">
              Facts Cooper knows about your organization. These are used as context in every conversation.
            </p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Add knowledge
          </Button>
        </div>

        {loading && <p className="text-muted-foreground">Loading...</p>}

        {!loading && facts.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No knowledge yet. Add facts about your organization to make Cooper smarter.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {facts.map((fact) => (
            <Card key={fact.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="flex-1">
                  <p className="text-sm">{fact.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{fact.source}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(fact.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="size-8 text-destructive shrink-0"
                  onClick={() => handleDelete(fact.id)}>
                  <TrashIcon />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <AddKnowledgeModal opened={modalOpened} onClose={() => setModalOpened(false)} onAdd={handleAdd} />
    </>
  );
}
```

- [ ] **Step 3: Create knowledge page**

Create `src/app/(app)/knowledge/page.tsx`:

```tsx
import { KnowledgeList } from '@/components/knowledge/KnowledgeList';

export default function KnowledgePage() {
  return <KnowledgeList />;
}
```

- [ ] **Step 4: Add nav link to sidebar**

In `src/components/chat/ChatSidebar.tsx`, add a "Knowledge" link next to "Connections". Add `BrainIcon` to the lucide-react import, then add after the Connections link:

```tsx
<button
  onClick={() => router.push('/knowledge')}
  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
>
  <BrainIcon className="size-4" />
  Knowledge
</button>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/knowledge/ src/app/\(app\)/knowledge/ src/components/chat/ChatSidebar.tsx
git commit -m "feat: add knowledge management UI"
```

---

## Task 9: Skills Management UI

**Files:**
- Create: `src/components/skills/SkillCard.tsx`
- Create: `src/components/skills/CreateSkillModal.tsx`
- Create: `src/components/skills/SkillList.tsx`
- Create: `src/app/(app)/skills/page.tsx`
- Modify: `src/components/chat/ChatSidebar.tsx`

- [ ] **Step 1: Create SkillCard**

Create `src/components/skills/SkillCard.tsx`:

```tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrashIcon, ZapIcon } from 'lucide-react';
import type { Skill } from '@/lib/types';

interface SkillCardProps {
  skill: Skill;
  onDelete: (id: string) => void;
}

export function SkillCard({ skill, onDelete }: SkillCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <ZapIcon className="size-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium text-sm">{skill.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">v{skill.version}</Badge>
                <Badge variant="secondary" className="text-xs">{skill.created_by}</Badge>
                {skill.tools.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
              {skill.steps.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {skill.steps.length} step{skill.steps.length !== 1 ? 's' : ''}:
                  {' '}{skill.steps.map((s) => s.action).join(' → ')}
                </div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8 text-destructive shrink-0"
            onClick={() => onDelete(skill.id)}>
            <TrashIcon />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create CreateSkillModal**

Create `src/components/skills/CreateSkillModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CreateSkillModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateSkillModal({ opened, onClose, onCreated }: CreateSkillModalProps) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/skills/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim() }),
    });

    if (res.ok) {
      setParsed(await res.json());
    } else {
      setError('Failed to parse skill description');
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!parsed) return;
    setLoading(true);

    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });

    setLoading(false);
    if (res.ok) {
      setDescription('');
      setParsed(null);
      onCreated();
      onClose();
    } else {
      setError('Failed to save skill');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open) { onClose(); setParsed(null); setError(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Skill</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="flex flex-col gap-4">
            <Textarea
              placeholder='e.g., "When I ask for a sprint summary, pull tickets from Linear, group by assignee, include story points, and format as a markdown table"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleParse} disabled={loading || !description.trim()}>
              {loading ? 'Parsing...' : 'Parse into skill'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium">{parsed.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{parsed.description}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Trigger</p>
              <p className="text-xs text-muted-foreground">{parsed.trigger}</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Steps</p>
              <ol className="text-xs text-muted-foreground list-decimal list-inside">
                {parsed.steps?.map((s: any, i: number) => (
                  <li key={i}>{s.action}{s.toolName && <Badge variant="outline" className="ml-1 text-[10px]">{s.toolName}</Badge>}</li>
                ))}
              </ol>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setParsed(null)}>
                Edit
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save skill'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create parse API endpoint**

Create `src/app/api/skills/parse/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { parseSkillFromNL } from '@/modules/skills/parser';
import { getToolsForOrg } from '@/modules/connections/registry';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: dbUser } = await supabase
    .from('users').select('org_id').eq('id', user.id).single();
  if (!dbUser) return new Response('User not found', { status: 404 });

  const { description } = await req.json();
  if (!description) return new Response('Missing description', { status: 400 });

  // Get available tool names for context
  const tools = await getToolsForOrg(supabase, dbUser.org_id);
  const toolNames = Object.keys(tools);

  const parsed = await parseSkillFromNL(description, toolNames);
  return Response.json(parsed);
}
```

- [ ] **Step 4: Create SkillList and page**

Create `src/components/skills/SkillList.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';
import { SkillCard } from './SkillCard';
import { CreateSkillModal } from './CreateSkillModal';
import type { Skill } from '@/lib/types';

export function SkillList() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadSkills() {
    const res = await fetch('/api/skills');
    if (res.ok) setSkills(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadSkills(); }, []);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/skills?id=${id}`, { method: 'DELETE' });
    if (res.ok) setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Skills</h2>
            <p className="text-sm text-muted-foreground">
              Teach Cooper how to do things your way. Describe a workflow in plain English.
            </p>
          </div>
          <Button onClick={() => setModalOpened(true)}>
            <PlusIcon data-icon="inline-start" />
            Create skill
          </Button>
        </div>

        {loading && <p className="text-muted-foreground">Loading...</p>}

        {!loading && skills.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">
            No skills yet. Create one to teach Cooper a workflow.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onDelete={handleDelete} />
          ))}
        </div>
      </div>

      <CreateSkillModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        onCreated={loadSkills}
      />
    </>
  );
}
```

Create `src/app/(app)/skills/page.tsx`:

```tsx
import { SkillList } from '@/components/skills/SkillList';

export default function SkillsPage() {
  return <SkillList />;
}
```

- [ ] **Step 5: Add skills nav link to sidebar**

In `src/components/chat/ChatSidebar.tsx`, add `ZapIcon` to imports and a "Skills" link after "Knowledge":

```tsx
<button
  onClick={() => router.push('/skills')}
  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
>
  <ZapIcon className="size-4" />
  Skills
</button>
```

- [ ] **Step 6: Verify and commit**

```bash
pnpm build
git add src/components/skills/ src/app/\(app\)/skills/ src/app/api/skills/ src/components/chat/ChatSidebar.tsx
git commit -m "feat: add skills management UI with NL parsing and creation flow"
```

---

## Task 10: Build Verification + E2E Test

- [ ] **Step 1: Run the build**

```bash
pnpm build
```

Fix any type errors.

- [ ] **Step 2: Run the migration**

Run `supabase/migrations/003_memory_skills.sql` in Supabase SQL Editor.

- [ ] **Step 3: Test knowledge flow**

1. Go to `/knowledge`, add a fact: "Our sprint cycle is 2 weeks starting Monday"
2. Go to `/chat`, ask "When does our sprint start?"
3. Cooper should reference the knowledge fact in its response

- [ ] **Step 4: Test skills flow**

1. Go to `/skills`, click "Create skill"
2. Describe: "When I ask for a standup summary, list what I worked on yesterday from Linear tickets"
3. Cooper should parse it into a structured skill
4. Save it, verify it appears in the list

- [ ] **Step 5: Test Composio (if configured)**

1. Go to `/connections`, add a platform connection with Composio API key
2. Go to `/chat`, ask Cooper to use a Composio-connected tool

- [ ] **Step 6: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve issues found during phase 3 e2e testing"
```

---

## Summary

After completing all tasks, you'll have:
- **pgvector** knowledge and skills tables with HNSW indexes and similarity search functions
- **Embedding provider** (behind interface, using Google/OpenAI embeddings)
- **Vector store** (Supabase pgvector, swappable to Pinecone/Turbopuffer)
- **Memory retriever** that injects relevant knowledge + skills into every agent call
- **Knowledge UI** — add/delete org facts at `/knowledge`
- **Skills system** — NL creation, structured parsing, embedding-based matching
- **Skills UI** — create/delete/view skills at `/skills`
- **Composio integration** — OAuth-managed tools via the unified API platform
- **Sidebar navigation** updated with Knowledge, Skills links
- Ready for Phase 4 (Scheduler & Crons)
