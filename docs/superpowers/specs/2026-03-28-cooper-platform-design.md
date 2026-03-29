# Cooper Platform Design Spec

## Overview

Cooper is an AI teammate that connects to an organization's tools, executes real work, and gets smarter over time. It lives across multiple channels (web, Slack, WhatsApp) with a single underlying agent engine. The MVP delivers a web chat experience with tool access, layered memory, skills, and scheduled tasks.

## Architecture: Modular Monolith

One Next.js app deployed on Vercel, with strict internal module boundaries. Each module communicates through TypeScript interfaces, making future extraction into separate services straightforward.

Vendor-agnostic interfaces wrap every external dependency (AI SDK, Vercel Workflow, future sandbox). Swapping vendors means writing a new adapter, not rewriting the app.

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 16 + React 19 | Already in project |
| UI | Mantine | Already in project |
| AI SDK | Vercel AI SDK | Behind `LLMProvider` interface |
| Orchestration | Vercel Workflow | Behind `WorkflowRuntime` interface |
| Database | Supabase (Postgres + pgvector) | Auth, data, memory, realtime |
| Auth | Supabase Auth (magic link only) | Passwordless email |
| Embeddings | OpenAI text-embedding-3-small | Behind `EmbeddingProvider` interface |
| Sandbox | None (MVP), E2B later | Behind `Sandbox` interface |

## Module Structure

```
src/
├── app/                          # Next.js routes & pages
│   ├── (marketing)/              # Existing landing page
│   ├── (app)/                    # Authenticated app experience
│   │   ├── chat/                 # Chat UI
│   │   ├── connections/          # Manage integrations
│   │   ├── skills/               # Skill editor & management
│   │   └── settings/             # User/org settings, model prefs
│   └── api/
│       ├── chat/                 # Chat endpoint
│       ├── connections/          # OAuth callbacks, connection CRUD
│       ├── skills/               # Skill CRUD
│       ├── crons/                # Cron management
│       └── webhooks/             # Inbound webhooks (Slack, etc.)
│
├── lib/                          # Shared utilities, config, types
│
├── modules/
│   ├── agent/                    # Channel-agnostic agent engine
│   │   ├── engine.ts             # Main agent loop
│   │   ├── router.ts             # Model routing
│   │   ├── tools.ts              # Tool registry
│   │   └── types.ts
│   │
│   ├── memory/                   # Layered memory system
│   │   ├── conversation.ts       # Thread/conversation history
│   │   ├── knowledge.ts          # Org knowledge base
│   │   ├── skills.ts             # Learned skill memory
│   │   └── retriever.ts          # Assembles relevant context
│   │
│   ├── connections/              # Integration layer
│   │   ├── registry.ts           # Unified tool registry
│   │   ├── mcp/                  # MCP client adapter
│   │   ├── custom/               # Hand-built connectors
│   │   └── platform/             # Unified API platform adapter
│   │
│   ├── channels/                 # Channel adapters
│   │   ├── web.ts                # Web chat adapter
│   │   └── slack.ts              # (Phase 5) Slack adapter
│   │
│   ├── scheduler/                # Cron & scheduled tasks
│   │   ├── manager.ts            # CRUD for scheduled tasks
│   │   └── executor.ts           # Workflow functions for execution
│   │
│   └── skills/                   # Skill system
│       ├── parser.ts             # NL to structured skill definition
│       ├── store.ts              # Skill persistence & retrieval
│       └── executor.ts           # Run a skill in agent loop
```

## Vendor-Agnostic Interfaces

### LLM Provider
```typescript
interface LLMProvider {
  streamText(params: StreamParams): AsyncIterable<StreamChunk>
  generateText(params: GenerateParams): Promise<GenerateResult>
}
```
AI SDK is the implementation today. LangChain becomes an alternative adapter.

### Workflow Runtime
```typescript
interface WorkflowRuntime {
  scheduleTask(task: ScheduledTask): Promise<string>
  cancelTask(taskId: string): Promise<void>
  pauseTask(taskId: string): Promise<void>
  resumeTask(taskId: string): Promise<void>
  listTasks(orgId: string): Promise<ScheduledTask[]>
}
```
Vercel Workflow is the implementation today. Inngest/Temporal become alternatives.

### Embedding Provider
```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}
```

## Agent Engine

### Request Flow
```
Channel (web/slack/cron)
  → Channel Adapter (normalizes input)
    → Agent Engine
      → Memory Retriever (pulls relevant context)
      → Model Router (picks model or uses user's choice)
      → LLM Provider (generates response, may call tools)
      → Tool Registry (dispatches to MCP/custom/platform tools)
      → Response (streamed back through channel adapter)
```

### Model Router
- **Auto mode (default):** Classifies request complexity and routes to the best model. Starts with Claude for everything, adds routing rules over time.
- **User override:** User selects a model in settings or per-message. Router respects that unconditionally.

### Tool Calling Loop
The engine runs an agentic loop inside a Vercel Workflow for durability:
1. LLM generates a response (may include tool calls)
2. Engine dispatches tool calls through the Tool Registry
3. Results fed back to the LLM
4. Repeat until LLM produces a final response
5. If a tool call fails, the workflow retries from that step

### Human-in-the-Loop
For sensitive actions, the engine pauses the workflow and asks for user confirmation through the channel. The workflow sleeps until the user responds.

## Memory System

Three layers, all backed by Supabase with pgvector:

### Layer 1: Conversation Memory
- Full message history per thread (messages, tool calls, results)
- Current thread context: last N messages always included
- Cross-thread recall: vector search across past threads when user references prior work

### Layer 2: Organizational Knowledge
- Facts about the org extracted from conversations (with user confirmation)
- Explicitly told facts ("Remember that our sprint cycle is 2 weeks")
- Stored with embeddings, tagged by org
- Retrieved via semantic similarity

### Layer 3: Skill Memory
- Learned workflows stored as structured definitions
- Created via natural language, refined through feedback
- Matched to incoming requests via semantic similarity

### Memory Retriever
Before every agent call, assembles context:
1. Current thread messages (always)
2. Top-K relevant knowledge facts (semantic search)
3. Matching skills (if request matches a known skill)
4. Relevant past threads (if user references prior work)

## Connections & Tool System

### Tool Registry Interface
```typescript
interface Tool {
  name: string
  description: string
  parameters: JSONSchema
  source: 'mcp' | 'custom' | 'platform'
  connectionId: string
  execute(params: unknown): Promise<ToolResult>
}

interface ToolRegistry {
  getToolsForOrg(orgId: string): Tool[]
  executeTool(name: string, params: unknown): Promise<ToolResult>
}
```

The agent engine sees a flat list of tools. It does not know the source.

### Source 1: MCP Servers
- Cooper runs as an MCP client
- Each connected MCP server exposes tools that get registered
- User connects by providing server URL/config

### Source 2: Custom Connectors
- Hand-built for core integrations (GitHub, Linear, Slack)
- OAuth managed by Cooper, tokens in Supabase (encrypted)
- Each connector exposes a set of Tool objects

### Source 3: Unified API Platform
- **Decision: evaluate Composio vs Nango in Phase 2** — pick based on tool coverage for your specific integrations, pricing, and MCP compatibility
- For the long tail of integrations
- Platform handles OAuth and token refresh
- Cooper wraps platform APIs as Tool objects
- Wrapped behind a `PlatformAdapter` interface so swapping platforms is one adapter change

### Tool Curation
Don't dump hundreds of endpoints on the LLM. The memory/skill system helps Cooper know which tools are relevant per request. Tool list is curated per invocation based on the connected services and the request context.

## Scheduler & Crons

### Scheduled Task Definition
```typescript
interface ScheduledTask {
  id: string
  orgId: string
  userId: string
  cron: string              // e.g., "0 9 * * 1"
  prompt: string            // Original user request
  skillId?: string          // If mapped to a learned skill
  channelConfig: { channel: 'web' | 'slack'; destination?: string }  // e.g., Slack channel ID
  status: 'active' | 'paused'
}
```

### Creation Flow
1. User: "Every Monday at 9am, summarize my open PRs"
2. Cooper parses into a cron + prompt, presents for confirmation
3. User approves, cron saved to Supabase, registered with WorkflowRuntime

### Execution Flow
1. Cron triggers → Workflow function starts
2. Calls agent engine with stored prompt + org context
3. Agent runs normally (memory, tools, reasoning)
4. Result delivered to configured channel
5. Execution logged (status, output, tokens, cost)

## Channel Adapters

### Interface
```typescript
interface ChannelAdapter {
  parseIncoming(raw: unknown): AgentInput
  formatOutgoing(response: AgentOutput): unknown
  streamResponse(stream: AsyncIterable<StreamChunk>): void
}
```

### Web Chat (MVP)
- Thread-based UI: sidebar with thread list, main area for active thread
- Streaming responses with inline tool call display
- Rich output: markdown, tables, code blocks
- Model selector dropdown (Auto / Claude / GPT-4 / etc.)
- Built with Mantine + Supabase Realtime

### Slack (Phase 5)
- Slack Events API for mentions, DMs, channel messages
- Thread support mapping to Cooper threads
- Same agent engine, same tools, same memory

### Cross-Channel Threads
Threads are stored in Supabase, owned by org + user, not by channel. A conversation started in web can be referenced from Slack via memory retrieval.

## Skills System

### Skill Definition
```typescript
interface Skill {
  id: string
  orgId: string
  name: string
  description: string
  trigger: string
  steps: SkillStep[]
  tools: string[]
  outputFormat?: string
  createdBy: 'user' | 'cooper'
  version: number
}

interface SkillStep {
  action: string
  toolName?: string
  params?: Record<string, unknown>
  condition?: string
}
```

### Creation
Natural language input → Cooper parses into structured Skill → presents for confirmation → saved to Supabase.

### Refinement
User feedback ("also include story points") → Cooper updates skill definition → bumps version → confirms change.

### Matching
Incoming messages checked against skill descriptions/triggers via semantic similarity. Matched skills inject their steps into the agent's context as guidance (not rigid scripts).

### Management UI
- List with name, description, last used, version
- Structured editor for trigger, steps, tools, output format
- Dry-run testing from editor
- Delete/disable

## Auth & Multi-tenancy

### Auth
Supabase Auth with magic link (email) only. No passwords, no social OAuth for MVP.

### Data Model
```
organizations    (id, name, slug, createdAt)
users            (id, orgId, email, name, role, modelPreference)
threads          (id, orgId, userId, title, createdAt)
messages         (id, threadId, role, content, toolCalls, metadata, createdAt)
connections      (id, orgId, type, provider, credentials_encrypted, status)
skills           (id, orgId, name, description, trigger, steps, tools, outputFormat, version, createdBy)
knowledge        (id, orgId, content, embedding, source, createdAt)
scheduled_tasks  (id, orgId, userId, cron, prompt, skillId, channelConfig, status, lastRunAt, nextRunAt)
execution_logs   (id, taskId, threadId, status, output, startedAt, completedAt, tokensUsed, cost)
```

### Security
- Row Level Security (RLS) from day one — users only see their org's data
- OAuth tokens encrypted at rest (Supabase Vault or app-level encryption)
- Tokens never exposed to client, all tool execution server-side
- Token refresh handled by connection adapters

### MVP Simplification
- Single-user per org is fine for MVP
- Team invites, roles, permissions come later
- RLS baked in from day one for future multi-tenancy

## MVP Phasing

### Phase 1: Core Agent Loop + Web Chat
- Supabase setup (schema, magic link auth, RLS)
- Agent engine with LLMProvider interface (Claude default)
- Web chat UI (threads, streaming, markdown)
- Basic conversation memory (thread history)

### Phase 2: Connections & Tools
- Connection management UI
- 2-3 custom connectors (GitHub, Linear)
- MCP client adapter
- Unified API platform adapter
- Tool registry wiring into agent engine

### Phase 3: Memory & Skills
- Org knowledge layer (pgvector, embedding pipeline)
- Memory retriever (context assembly per request)
- Skill creation via natural language
- Skill management UI (structured editor)
- Cross-thread memory recall

### Phase 4: Scheduler & Crons
- Vercel Workflow integration with runtime interface
- Scheduled task creation (NL → cron)
- Execution logging and history
- Management UI
- Human-in-the-loop approval flow

### Phase 5: Slack Channel (post-MVP)
- Slack app setup (Events API, OAuth)
- Slack channel adapter
- Channel-agnostic thread linking
