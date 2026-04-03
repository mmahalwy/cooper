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

## Avoid useEffect
- Do NOT use `useEffect` for data fetching. Use React Server Components, server actions, or React Suspense with async components instead.
- Do NOT use `useEffect` for derived state. Use `useMemo` or compute during render.
- The only acceptable uses of `useEffect` are: event listeners (focus, resize, keyboard), third-party library integration, and cleanup on unmount.
- When tempted to add `useEffect`, ask: can this be a server component? Can this use Suspense? Can this be computed during render?
