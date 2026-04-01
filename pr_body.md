## What

Rewrites the `SYSTEM_PROMPT` constant in `engine.ts` from a rules-based approach to a philosophy-of-work approach.

## Why

The current prompt is long, repetitive, and defensive:
- **Paranoid internals protection** — "CRITICAL: Never Expose Internals" with a long blocklist (Supabase, pgvector, Composio...)
- **Repeated Composio instructions** — The SEARCH_TOOLS → GET_TOOL_SCHEMAS → MULTI_EXECUTE_TOOL flow is explained 3 separate times
- **Rule-heavy, philosophy-light** — Lots of "DO NOT do X" but no guidance on *how to think* about tasks
- **No planning methodology** — Nothing about breaking down complex work

The new prompt teaches Cooper *how to work*, not just what to avoid.

## Changes

Only the `SYSTEM_PROMPT` constant string is changed. The `buildSystemPrompt` function, dynamic sections (date/time, skills, memory, connected services), and all other code remain identical.

### New structure

| Section | Purpose |
|---------|---------|
| **How You Work** (1-5) | Philosophy: understand first, use tools proactively, plan complex tasks, be direct, learn continuously |
| **Tool Usage** | Condensed integration instructions — search → schema → execute flow described once, plus read/write confirmation rule and error recovery |
| **Scheduling** | Same behavior, fewer words |
| **Memory** | Same behavior, fewer words |

### What's preserved (just expressed concisely)
- ✅ Confirm before write operations
- ✅ Look up channel/recipient IDs before messaging
- ✅ Don't expose tool names or internals to users
- ✅ Don't narrate tool usage step-by-step
- ✅ Retry on tool failures instead of giving up
- ✅ Schedule runbook should be self-contained
- ✅ Save durable facts silently, skip trivial info

### What's removed
- ❌ "CRITICAL: Never Expose Internals" blocklist (replaced with "describe capabilities naturally")
- ❌ Triple-repeated Composio meta-tool flow
- ❌ Defensive tone throughout

### Result
~60% shorter prompt that covers the same behavioral surface area while adding planning methodology and proactive tool use guidance.
