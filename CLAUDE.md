@AGENTS.md

# Project Rules

## Mantine + Next.js RSC
- Do NOT use Mantine compound/namespaced components (e.g., `AppShell.Navbar`, `AppShell.Main`) in Server Components or server-rendered layouts. They require client-side React context to resolve.
- Instead, wrap Mantine compound components in a `'use client'` component and import that from the server layout.

## Avoid useEffect
- Do NOT use `useEffect` for data fetching. Use React Server Components, server actions, or React Suspense with async components instead.
- Do NOT use `useEffect` for derived state. Use `useMemo` or compute during render.
- The only acceptable uses of `useEffect` are: event listeners (focus, resize, keyboard), third-party library integration, and cleanup on unmount.
- When tempted to add `useEffect`, ask: can this be a server component? Can this use Suspense? Can this be computed during render?
