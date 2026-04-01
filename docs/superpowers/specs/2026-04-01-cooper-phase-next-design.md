# Cooper Next Phase — Reliability, Intelligence, Planning

> Design spec for 9 improvements across 3 phases. Approved 2026-04-01.

## Phase 1: Reliability & UX

### 1.1 Tool Caching / Prewarming

**Problem:** Every chat request re-fetches Composio tools if the 5-min cache expired.

**Changes:**
- `src/modules/connections/platform/composio.ts` — Increase `CACHE_TTL_MS` from 5min to 30min
- Prewarm on first `/api/chat` request if cache is empty (non-blocking background fetch)
- Cache the tool permission map in the registry alongside tools so it doesn't re-query `connections.config` every request
- Call `clearComposioCache()` when a connection is added or removed (in `syncConnectionsAction` and `deleteConnectionAction`)

**No new tables.** In-memory caching only.

---

### 1.2 Scheduler Retry + Notify on Failure

**Problem:** `consecutive_failures` is tracked but nothing happens when failures accumulate.

**Changes:**
- `src/modules/scheduler/executor.ts` — After incrementing `consecutive_failures`, check if >= 5. If so, auto-pause the task.
- Insert a notification message into a system thread or the user's most recent thread: "Your scheduled task '{name}' has been paused after 5 consecutive failures. Last error: {error_message}"
- `src/modules/scheduler/db.ts` — Add helper `getTaskFailureCount()`

**Migration:** Add `failure_reason text` column to `scheduled_tasks` (stores last error for display on schedules page).

**UI:** Show failure reason on `ScheduleCard` when status is paused and failure_reason is set.

---

### 1.3 Scheduler Rolling Summary

**Problem:** Each scheduled run is independent — no memory of previous runs.

**Changes:**
- **Migration:** Add `rolling_summary text` column to `scheduled_tasks`
- `src/modules/scheduler/executor.ts` — After each successful run:
  1. Take the run output + existing `rolling_summary`
  2. Call Gemini Flash to condense into a ~500 word rolling context
  3. Update `scheduled_tasks.rolling_summary`
- Inject into executor system prompt: `"## Previous Run Context\n{task.rolling_summary}"`
- First run: rolling_summary is null, skipped

**Token budget:** The summary call uses ~1K tokens. Acceptable overhead per scheduled run.

---

### 1.4 Connections Page Redesign

**Problem:** Current 2-column grid with descriptions is cluttered. Doesn't match the target design.

**Target design (from screenshot):**
- 3-column grid of compact cards
- Each card: integration logo (from Composio `meta.logo`) + name + connection status
- No descriptions on grid cards
- Tabs: "All integrations" / "Popular integrations"
- "Show connected only" toggle (right-aligned)
- Full-width search bar at top
- "+ Add Custom MCP" button top right
- Green dot + "1 account connected" for connected integrations
- Click card → `/connections/[appName]` detail page

**Files to change:**
- `src/components/connections/IntegrationsCatalog.tsx` — Rewrite grid layout, add tabs and toggle
- `src/components/connections/IntegrationCard.tsx` — Compact card: logo + name + status only
- `src/lib/integrations-catalog.ts` — Add `logo` to the `Integration` interface (already fetched from Composio but not used in UI)

**No new tables.** Logo URLs come from Composio's `meta.logo` field already stored in the integration data.

---

## Phase 2: Intelligence

### 2.1 Model Routing

**Problem:** Everything uses Gemini Flash. Complex multi-tool chains fail because Flash isn't capable enough.

**New file:** `src/modules/agent/model-router.ts`

**Routing tiers:**
| Tier | When | Model | Provider |
|------|------|-------|----------|
| Simple | Greetings, single lookups, Q&A | Gemini Flash | Google |
| Medium | Multi-step tool use, scheduled tasks | GPT-4o | OpenAI |
| Complex | Multi-service orchestration, planning, 3+ tool chains, prior step failures | Claude Sonnet | Anthropic |

**Classification signals:**
- Message length and complexity
- Number of connected services referenced
- Keywords: "plan", "analyze", "compare", "report", "across"
- Conversation history: if prior steps had tool errors, escalate tier
- Explicit user override (future — not in this phase)

**Changes:**
- `package.json` — Add `@ai-sdk/anthropic`, `@ai-sdk/openai`
- `src/modules/agent/model-router.ts` — `selectModel(message, history, connectedServices)` returns `{ model, provider, tier }`
- `src/modules/agent/engine.ts` — Replace static `google(modelName)` with router output
- `src/modules/scheduler/executor.ts` — Default to medium tier
- Env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (optional — falls back to Gemini if not set)
- Logged to `usage_logs.model_id` and `usage_logs.model_provider` (already exists)

---

### 2.2 Tool Simplification (Pre-resolved Actions)

**Problem:** Composio's 3-hop meta-tool pattern (SEARCH → SCHEMA → EXECUTE) fails frequently across all models.

**Design:** At connection sync time, fetch the top 20 actions per app and generate direct tool wrappers.

**Changes:**
- `src/app/actions.ts` (`syncConnectionsAction`) — After syncing, fetch top 20 actions per app from Composio API, store in `connections.config.resolvedActions`
- `src/modules/connections/registry.ts` — For each resolved action, create an AI SDK `tool()` wrapper:
  ```
  tool({
    description: action.description,
    inputSchema: z.object(/* from action parameters */),
    execute: async (input) => {
      // Call COMPOSIO_MULTI_EXECUTE_TOOL under the hood
      return composioExecute(action.slug, input);
    },
    needsApproval: /* based on saved permission for this slug */
  })
  ```
- Keep meta-tools (SEARCH_TOOLS, MULTI_EXECUTE_TOOL, GET_TOOL_SCHEMAS) as fallback for actions not in top 20
- New helper: `src/modules/connections/platform/action-resolver.ts` — fetches and caches resolved actions

**Data shape in `connections.config.resolvedActions`:**
```json
[
  {
    "slug": "SLACK_SEND_MESSAGE",
    "displayName": "Send message",
    "description": "Send a message to a Slack channel",
    "parameters": { "channel": { "type": "string" }, "text": { "type": "string" } }
  }
]
```

**Re-sync:** Triggered when user visits connection detail page or clicks Refresh on integrations page.

---

### 2.3 Tool Allow/Deny Filtering

**Problem:** Tools set to "Off" in the UI still appear in the model's tool set. They trigger approval which blocks, but the model shouldn't see them at all.

**Changes:**
- `src/modules/connections/registry.ts` — When building the tool set:
  - For pre-resolved action wrappers: skip tools where `perm === 'disabled'`
  - For meta-tools: build a `disabledSlugs` set and inject it into the MULTI_EXECUTE_TOOL wrapper. If the model tries to execute a disabled slug, return an error: `"This action is disabled by your admin."`
- No new tables. Uses existing `connections.config.toolPermissions`.

---

## Phase 3: Planning

### 3.1 Plan Creation Tool

**Problem:** Cooper executes immediately. No way to review an approach before acting on complex tasks.

**Migration:** New `plans` table:
```sql
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'executing', 'completed', 'failed')),
  steps jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Step schema (jsonb array):**
```json
{
  "id": "step-1",
  "description": "Search for Slack channel #social",
  "tool_hint": "slack_list_channels",
  "status": "pending",
  "output": null
}
```

**New tool:** `create_plan` in `src/modules/planning/tools.ts`
- Creates a plan in the DB, returns the plan to the model
- Model presents the plan to the user in chat

**System prompt addition:**
```
For tasks involving 3+ services or 5+ steps, create a plan first.
Present it to the user and wait for approval before executing.
For simple tasks, just do them directly.
```

---

### 3.2 Hybrid Plan UI

**Simple plans (< 5 steps):** Cooper writes inline as a numbered list, asks "Look good?". No DB storage. User says yes → Cooper executes.

**Complex plans (5+ steps):** Rendered via new `PlanView` component:
- `src/components/chat/PlanView.tsx`
- Shows steps with status indicators (pending dot, spinner, checkmark, X)
- "Approve" / "Cancel" buttons when plan is in `draft` state
- Live progress updates when `executing` — steps update via polling or optimistic UI
- Collapses into a summary when `completed`

**Rendered in `ChatMessages.tsx`** — detect plan-related data parts and render `PlanView` instead of plain text.

---

### 3.3 Clarifying Questions

**Prompt-driven, no new tools.**

System prompt addition:
```
Before planning complex tasks, identify what's ambiguous.
Ask 1-2 targeted questions if the request could be interpreted multiple ways.
Don't over-ask — if intent is clear, plan and execute.
For scheduled tasks, never ask questions — the prompt is the runbook.
```

---

### 3.4 Plan Execution

**New tool:** `execute_plan` in `src/modules/planning/tools.ts`
- Takes a plan ID
- Iterates through steps sequentially
- Updates each step's status and output in the DB after completion
- Emits progress in the chat stream
- On step failure: Cooper decides to skip, retry, or abort based on error type
- On completion: marks plan as `completed`, summarizes results

**Plans are linked to threads** via `thread_id` — visible in conversation history.

---

## Phasing Summary

| Phase | Items | Estimated PRs |
|-------|-------|---------------|
| 1 - Reliability & UX | Tool caching, scheduler retry/notify, rolling summary, connections redesign | 4 |
| 2 - Intelligence | Model routing, tool simplification, tool allow/deny | 3-4 |
| 3 - Planning | Plan tool, plan UI, clarifying questions, plan execution | 2-3 |

## Dependencies

- Phase 2.2 (tool simplification) makes Phase 2.3 (allow/deny) much cleaner — resolved actions have individual permission checks built in
- Phase 2.1 (model routing) should land before Phase 3 — planning quality depends on a smarter model
- Phase 1 items are all independent of each other
