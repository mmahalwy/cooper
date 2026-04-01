# Cooper Architecture Review: What Needs to Change

*Reviewed by Viktor — an AI teammate that's been in production, doing real work across Slack, GitHub, calendars, and code execution for teams.*

---

## Executive Summary

Cooper has solid foundations: clean modular structure, good Supabase schema with RLS from day one, vector memory with embeddings, a working scheduler, and Composio for the long tail of integrations. The design spec is thoughtful and forward-looking.

But there's a **massive gap** between where Cooper is and what makes an AI teammate actually useful in production. Here's what matters most, ordered by impact.

---

## 🔴 Critical: The Sandbox Gap

**This is the single biggest missing piece.**

Cooper can only use pre-defined tools (Composio actions, MCP tools, save_knowledge, create_schedule). It cannot:

- Write and run code to solve arbitrary problems
- Process files (parse PDFs, manipulate Excel, generate images)
- Install packages dynamically
- Iterate on solutions (write script → run → see error → fix → run again)
- Build anything novel that isn't covered by an existing tool

Viktor's most powerful capability is a persistent sandboxed environment where it writes Python/bash scripts, installs packages, and executes them. This is what transforms an AI from a chatbot into a coworker.

### What to build

```
src/modules/sandbox/
├── runtime.ts        # Sandbox interface + implementation
├── tools.ts          # execute_code, read_file, write_file tools
├── file-manager.ts   # File upload/download between user and sandbox
└── types.ts
```

**Options:**
- **E2B** (your spec mentions this) — hosted sandbox, fast cold starts, good Python support
- **Modal** — serverless containers, great for heavy compute
- **Self-hosted Docker** — more control, more ops work

**The sandbox tools the agent needs:**
- `execute_code` — Run Python/bash with stdout/stderr capture
- `read_file` / `write_file` — Persistent filesystem within the sandbox
- `install_package` — `pip install` / `npm install` within sandbox
- File upload/download between the chat UI and sandbox

Without this, Cooper is fundamentally limited to "call APIs and chat" — which is table stakes, not differentiation.

---

## 🔴 Critical: System Prompt Architecture

Cooper's system prompt is a long list of instructions and restrictions. Viktor's approach is fundamentally different — it's built around **a philosophy of work**:

### Current (Cooper)
- "You are Cooper, an AI teammate"
- Long list of DO NOT rules
- Tool-specific instructions (how to use Composio)
- Generic "be helpful" guidance

### What works (Viktor pattern)
- **Core philosophy**: "You work by programming. Skills are your memory. Scripts are your hands."
- **Work approach**: "Understand deeply first → investigate thoroughly → work by scripting → quality check → learn and update"
- **Proactive behavior**: "You're not just reactive. Propose ideas, suggest improvements."
- **Deep investigation requirement**: "1-2 queries are never enough. Follow each lead thoroughly."

The key insight: **tell the AI HOW to think, not just WHAT to do.** Cooper's prompt is reactive ("when asked X, do Y"). Viktor's prompt creates an autonomous agent that plans its own approach.

### Specific improvements:
1. Add a "work approach" section that teaches Cooper to plan before acting
2. Add quality requirements — "verify facts, cross-reference, don't guess"
3. Add proactivity guidelines — "if you see something that could be better, say so"
4. Remove the excessive "don't expose internals" paranoia — it makes the agent defensive. A simple "present capabilities in natural language" is sufficient.
5. The Composio meta-tool instructions (SEARCH_TOOLS → GET_TOOL_SCHEMAS → MULTI_EXECUTE_TOOL) are good but should be condensed — the current version is too verbose and repetitive.

---

## 🟡 Important: Message Window Management

**Current:** All messages are sent to the model every turn. This WILL blow up on long conversations.

**Fix:** Implement a sliding window:
- Always include the last 20 messages in full
- For older messages: create a brief summary and prepend it
- Track token count and truncate if approaching model limits

This is a production time bomb — the first user who has a 50-message conversation will hit token limits and get errors.

---

## 🟡 Important: Web Search Missing from Chat

The scheduled task executor has `google.tools.googleSearch({})` as a built-in tool, but the main chat engine does NOT. Your system prompt says "You can search the web" but you never give it the tool. Users will ask Cooper to search for things and it literally can't.

Easy fix — add `google_search: google.tools.googleSearch({})` to builtInTools in `engine.ts`.

---

## 🟡 Important: Scheduler Reliability

### Sequential execution
Tasks run in a `for` loop. If task 1 takes 60s, tasks 2-20 wait. Use `Promise.allSettled` with a concurrency limit.

### No locking / deduplication
Cron runs every 5 minutes. If a task takes 6 minutes, it gets picked up again. Need a `locked_until` column with atomic claim-and-lock.

### No failure tracking
If a task fails every run (bad API key, deleted resource), it just keeps failing forever. Track consecutive failures, auto-pause after 3.

### No timeout
A single runaway task can consume the entire Vercel function duration. Add per-task timeouts.

---

## 🟡 Important: Knowledge Deduplication

The memory extractor runs after every conversation turn. Nothing prevents it from saving "User prefers dark mode" 15 times. Need:
- Semantic similarity check before insert (>0.90 = skip, 0.80-0.90 = update, <0.80 = insert)
- This prevents knowledge base bloat which wastes context window space

---

## 🟢 Good to Have: Model Routing

Cooper only uses Gemini (Flash and Pro). The config has an Anthropic API key placeholder. Viktor routes between models based on task type. Consider:

- Quick factual questions → Flash/Haiku (fast, cheap)
- Complex reasoning → Pro/Sonnet (better quality)
- Code generation → Claude (currently leads on code)
- User override → always respected

The `MODELS` map in engine.ts should be expanded, and the model router from your spec should be implemented.

---

## 🟢 Good to Have: Duplicate Type Definitions

`ScheduledTask` and `ExecutionLog` are defined in both `src/lib/types.ts` and `src/modules/scheduler/types.ts`. Pick one source of truth (recommend `src/lib/types.ts`) and delete the duplicate.

---

## 🟢 Good to Have: Skills System Consolidation

There are currently THREE locations for skills:
- `.agents/skills/` — filesystem skills with SKILL.md (loaded by the system)
- `.claude/skills/` — another copy
- `.cortex/skills/` — yet another copy
- Database `skills` table — user-created skills via chat

The filesystem skills are duplicated across 3 directories (agents, claude, cortex) — this is confusing. Consolidate to one location and gitignore the others, or implement a build step that syncs them.

---

## 🟢 Good to Have: Cross-Thread Memory

Your spec mentions "Cross-thread recall: vector search across past threads when user references prior work" but this isn't implemented. The retriever only pulls knowledge and skills, not past conversation context.

To implement:
1. After each conversation, embed a summary of the thread
2. Store in a `thread_summaries` table with vector column
3. In the retriever, optionally search thread summaries when the user references past work

---

## Architecture Comparison: Cooper vs Viktor

| Capability | Cooper | Viktor | Gap |
|-----------|--------|--------|-----|
| Chat UI | ✅ Web chat | ✅ Slack native | Different channels, both work |
| Tool integrations | ✅ Composio + MCP | ✅ Native + MCP | Cooper has broader catalog |
| Memory / Knowledge | ✅ pgvector | ✅ Skills + persistent files | Both functional |
| Scheduler / Crons | ✅ Basic | ✅ Robust with monitoring | Cooper needs reliability work |
| Code execution | ❌ None | ✅ Full sandbox | **Critical gap** |
| File processing | ❌ None | ✅ PDF, Excel, PPTX, images | **Critical gap** |
| Web browsing | ❌ Search only | ✅ Full browser automation | Major gap |
| Proactive behavior | ❌ Reactive only | ✅ Suggests improvements | Prompt architecture |
| Multi-step planning | ⚠️ Basic (10 steps) | ✅ Deep (50+ steps) | Step limit too low |
| Thread management | ⚠️ No windowing | ✅ Managed context | Will break on long threads |
| Cross-channel | ⚠️ Web only | ✅ Slack + threads | Planned for Phase 5 |
| Error recovery | ⚠️ Basic | ✅ Retries + monitoring | Scheduler needs work |

---

## Recommended Priority Order

1. **Sandbox / Code Execution** — This is the difference between chatbot and coworker
2. **Message windowing** — Production time bomb, fix before users hit it
3. **Web search in chat** — Easy fix, huge UX improvement
4. **Scheduler reliability** — Locking, parallel exec, failure tracking
5. **System prompt overhaul** — Makes the agent dramatically better
6. **Knowledge deduplication** — Prevents memory bloat
7. **Model routing** — Cost optimization + quality improvement
8. **Slack integration** — Already planned, expands reach significantly
9. **Cross-thread memory** — Nice to have for returning users
10. **File processing tools** — Natural extension of sandbox

---

## What Cooper Does Well

Credit where it's due — some things are genuinely good:

- **Modular monolith structure** — Clean separation, easy to extract services later
- **RLS from day one** — Multi-tenancy is baked in, not bolted on
- **Vendor-agnostic interfaces** — VectorStore, EmbeddingProvider, etc. are well-designed
- **Composio integration** — Smart choice for the long tail of integrations
- **Skills system design** — The dual system (filesystem + database) has merit
- **Memory extraction** — The background extraction after each turn is a good pattern
- **The spec** — The platform design doc is thorough and well-thought-out
- **Supabase Postgres** — Great choice for the MVP, scales well

The foundation is solid. The gap is in execution capabilities (sandbox) and reliability (scheduler, windowing, dedup).
