@AGENTS.md

# Project Rules

## Mantine + Next.js RSC
- Do NOT use Mantine compound/namespaced components (e.g., `AppShell.Navbar`, `AppShell.Main`) in Server Components or server-rendered layouts. They require client-side React context to resolve.
- Instead, wrap Mantine compound components in a `'use client'` component and import that from the server layout.

## Composio for All Integrations
- Always use Composio for connecting to and interacting with third-party services (GitHub, Slack, Google Calendar, etc.).
- Do NOT build custom OAuth token extraction, direct API clients, or separate auth flows. Composio handles auth, token refresh, and API calls.
- The `use_integration` tool is the standard way Cooper interacts with connected services — it delegates to Composio under the hood.
- Only build custom integration code if Composio explicitly cannot handle a specific use case.

## Arrow Functions
- Always use arrow functions: `const myFunc = () => {}`, `const MyComponent = () => {}`.
- Do NOT use `function` declarations (`function myFunc() {}`) unless required (e.g., hoisting, generator functions, or when `this` binding is needed).

## Chat Threading — CRITICAL
- The `/chat` page uses `replaceState` to update the URL to `/chat/[threadId]` after the first message, but the component does NOT remount — it's still the `/chat/page.tsx` component.
- `DefaultChatTransport` captures `body` at construction time. A getter or ref on `body` does NOT work for dynamic values.
- The threadId MUST be injected into the fetch body by intercepting the `fetch` call and parsing/modifying the JSON body. See `src/app/(app)/chat/page.tsx` for the pattern.
- DO NOT remove or "simplify" the fetch body injection — without it, every follow-up message creates a new thread instead of continuing the conversation.
- If you change anything about how chat messages are sent or threads are created, verify that multi-message conversations persist to the SAME thread.

## Avoid useEffect
- Do NOT use `useEffect` for data fetching. Use React Server Components, server actions, or React Suspense with async components instead.
- Do NOT use `useEffect` for derived state. Use `useMemo` or compute during render.
- The only acceptable uses of `useEffect` are: event listeners (focus, resize, keyboard), third-party library integration, and cleanup on unmount.
- When tempted to add `useEffect`, ask: can this be a server component? Can this use Suspense? Can this be computed during render?
