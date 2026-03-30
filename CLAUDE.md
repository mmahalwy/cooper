@AGENTS.md

# Project Rules

## Mantine + Next.js RSC
- Do NOT use Mantine compound/namespaced components (e.g., `AppShell.Navbar`, `AppShell.Main`) in Server Components or server-rendered layouts. They require client-side React context to resolve.
- Instead, wrap Mantine compound components in a `'use client'` component and import that from the server layout.
