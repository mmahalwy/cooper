## Cross-thread memory — recall past conversations

Cooper currently retrieves knowledge facts and skills for context, but has no awareness of previous conversation threads. This means every new thread starts from scratch, even if the user discussed the same topic yesterday.

This PR adds **cross-thread memory** so Cooper can recall relevant past conversations when responding.

### How it works

1. **After each conversation** (4+ messages), the thread is summarized into a concise 2-4 sentence summary using Gemini Flash
2. **Summaries are embedded** (768-dim vector via `gemini-embedding-001`) and stored in a new `thread_summaries` table
3. **On each new message**, the retriever queries `match_thread_summaries` alongside existing knowledge/skills RPCs — all three run in parallel
4. **Matched summaries** are injected into the system prompt under "Relevant past conversations"

### Changes

| File | What changed |
|------|-------------|
| `supabase/migrations/007_thread_summaries.sql` | New table, RLS policy, and `match_thread_summaries` RPC |
| `src/modules/memory/thread-summary.ts` | New module — summarize + embed + upsert thread summaries |
| `src/modules/memory/retriever.ts` | Added `threadSummaries` to `MemoryContext`, query runs in parallel with existing RPCs |
| `src/modules/agent/engine.ts` | Inject matched thread summaries into system prompt |
| `src/app/api/chat/route.ts` | Trigger background summarization after each response |

### Design decisions

- **Minimum 4 messages** before summarizing — avoids noise from trivial exchanges
- **Upsert pattern** — summaries update as conversations grow (skips if message count hasn't changed)
- **0.60 similarity threshold** — slightly lower than knowledge (0.65) since summaries are broader
- **Top 3 matches** — keeps prompt lean while providing useful cross-thread context
- **8000 char cap** on conversation text sent to the summarizer to stay within token limits
- **Fire-and-forget** — summarization runs in the background, errors are caught and logged without affecting the chat response
