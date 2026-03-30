# Cooper Phase 1: Core Agent Loop + Web Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational agent engine with a web chat UI — the user can sign in via magic link, create threads, chat with Cooper (powered by Claude), and see streaming responses with conversation history.

**Architecture:** Modular monolith in Next.js 16. The agent engine lives in `src/modules/agent/` behind vendor-agnostic interfaces. Supabase handles auth (magic link), database (threads/messages), and realtime. The web chat UI uses Mantine components with the Vercel AI SDK's `useChat` hook for streaming. The existing marketing landing page stays untouched in a `(marketing)` route group.

**Tech Stack:** Next.js 16, React 19, Mantine 8, Vercel AI SDK (`ai` + `@ai-sdk/react` + `@ai-sdk/anthropic`), Supabase (`@supabase/supabase-js` + `@supabase/ssr`), Zod, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-28-cooper-platform-design.md`

---

## File Structure

```
src/
├── app/
│   ├── (marketing)/              # Route group for existing landing page
│   │   ├── layout.tsx            # Marketing layout (move existing layout bits here)
│   │   └── page.tsx              # Move existing page.tsx here
│   ├── (app)/                    # Route group for authenticated app
│   │   ├── layout.tsx            # App shell layout (sidebar + main area)
│   │   ├── chat/
│   │   │   ├── page.tsx          # Chat page (redirects to new thread or shows empty state)
│   │   │   └── [threadId]/
│   │   │       └── page.tsx      # Chat thread page
│   │   └── settings/
│   │       └── page.tsx          # Placeholder settings page
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx          # Magic link login page
│   │   ├── callback/
│   │   │   └── route.ts          # Auth callback handler
│   │   └── signout/
│   │       └── route.ts          # Sign out handler
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Chat streaming endpoint
│   ├── layout.tsx                # Root layout (providers only)
│   ├── globals.css
│   └── favicon.ico
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client
│   │   └── middleware.ts         # Auth refresh logic for middleware
│   ├── types.ts                  # Shared types (Thread, Message, etc.)
│   └── config.ts                 # Environment config
│
├── modules/
│   └── agent/
│       ├── engine.ts             # Agent engine (vendor boundary — internals use AI SDK)
│       └── types.ts              # Agent-specific types
│
├── components/
│   ├── chat/
│   │   ├── ChatSidebar.tsx       # Thread list sidebar
│   │   ├── ChatMessages.tsx      # Message list with streaming
│   │   ├── ChatInput.tsx         # Message input area
│   │   ├── MessageBubble.tsx     # Single message rendering (markdown, etc.)
│   │   └── EmptyState.tsx        # No thread selected state
│   ├── auth/
│   │   └── LoginForm.tsx         # Magic link login form
│   ├── Navbar.tsx                # Existing (stays for marketing)
│   ├── Hero.tsx                  # Existing (stays for marketing)
│   └── ... (other existing components)
│
├── middleware.ts                  # Root middleware (auth token refresh)
└── theme.ts                      # Existing Mantine theme
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Supabase packages**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Install Vercel AI SDK packages**

```bash
pnpm add ai @ai-sdk/react @ai-sdk/anthropic zod
```

- [ ] **Step 3: Create `.env.local` with placeholder values**

Create `.env.local` at project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
```

- [ ] **Step 4: Add `.env.local` to `.gitignore`**

Check `.gitignore` — if `.env.local` is not already listed, add it. (Next.js projects typically have this already.)

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore
git commit -m "feat: install supabase, vercel ai sdk, and anthropic dependencies"
```

---

## Task 2: Set Up Supabase Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

This task creates the SQL migration file. You'll run it against your Supabase project via the SQL editor or Supabase CLI.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable pgvector extension for future memory features
create extension if not exists vector with schema extensions;

-- Organizations table
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now() not null
);

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'admin' check (role in ('admin', 'member')),
  model_preference text default 'auto',
  created_at timestamptz default now() not null
);

-- Threads table
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Messages table
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_calls jsonb,
  metadata jsonb,
  created_at timestamptz default now() not null
);

-- Indexes
create index idx_threads_org_id on public.threads(org_id);
create index idx_threads_user_id on public.threads(user_id);
create index idx_messages_thread_id on public.messages(thread_id);
create index idx_messages_created_at on public.messages(created_at);

-- Row Level Security
alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;

-- RLS Policies: users can only access their own org's data
create policy "Users can view own org"
  on public.organizations for select
  using (id in (select org_id from public.users where id = auth.uid()));

create policy "Users can view org members"
  on public.users for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can view own org threads"
  on public.threads for select
  using (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can create threads in own org"
  on public.threads for insert
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Users can update own threads"
  on public.threads for update
  using (user_id = auth.uid());

create policy "Users can view messages in own org threads"
  on public.messages for select
  using (thread_id in (
    select id from public.threads
    where org_id in (select org_id from public.users where id = auth.uid())
  ));

create policy "Users can insert messages in own org threads"
  on public.messages for insert
  with check (thread_id in (
    select id from public.threads
    where org_id in (select org_id from public.users where id = auth.uid())
  ));

-- Function to auto-create org + user on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  -- Create a personal org for the new user
  insert into public.organizations (name, slug)
  values (
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    replace(gen_random_uuid()::text, '-', '')
  )
  returning id into new_org_id;

  -- Create the user record
  insert into public.users (id, org_id, email, name)
  values (
    new.id,
    new_org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );

  return new;
end;
$$;

-- Trigger to run on new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Run the migration against your Supabase project**

Go to your Supabase dashboard → SQL Editor → paste and run the migration. Or if using Supabase CLI:

```bash
supabase db push
```

- [ ] **Step 3: Configure magic link auth in Supabase dashboard**

In the Supabase dashboard:
1. Go to Authentication → Providers → Email
2. Ensure "Enable Email provider" is ON
3. Ensure "Enable Email Confirmations" is ON
4. Set the Site URL to `http://localhost:3000`
5. Add `http://localhost:3000/auth/callback` to Redirect URLs

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema with RLS and auto-org creation"
```

---

## Task 3: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`
- Create: `src/lib/config.ts`
- Create: `src/lib/types.ts`

- [ ] **Step 1: Create environment config**

Create `src/lib/config.ts`:

```typescript
export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },
} as const;
```

- [ ] **Step 2: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr';
import { config } from '@/lib/config';

export function createClient() {
  return createBrowserClient(config.supabase.url, config.supabase.anonKey);
}
```

- [ ] **Step 3: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll is called from Server Components where cookies can't be set.
          // This can be ignored if middleware is refreshing sessions.
        }
      },
    },
  });
}
```

- [ ] **Step 4: Create middleware helper**

Create `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@/lib/config';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the auth token — important for Server Components
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users trying to access the app
  if (!user && request.nextUrl.pathname.startsWith('/chat')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname.startsWith('/auth/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/chat';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 5: Create shared types**

Create `src/lib/types.ts`:

```typescript
export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'member';
  model_preference: string;
  created_at: string;
}

export interface Thread {
  id: string;
  org_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: unknown[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/
git commit -m "feat: add supabase client setup, config, and shared types"
```

---

## Task 4: Auth Middleware + Routes

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/auth/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/signout/route.ts`
- Create: `src/components/auth/LoginForm.tsx`

- [ ] **Step 1: Create root middleware**

Create `src/middleware.ts`:

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder
     * - api routes that don't need auth
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 2: Create the login form component**

Create `src/components/auth/LoginForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { TextInput, Button, Stack, Text, Paper, Title, Alert } from '@mantine/core';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <Paper p="xl" radius="md" withBorder maw={400} mx="auto" mt={100}>
        <Stack>
          <Title order={3}>Check your email</Title>
          <Text c="dimmed">
            We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper p="xl" radius="md" withBorder maw={400} mx="auto" mt={100}>
      <form onSubmit={handleSubmit}>
        <Stack>
          <Title order={3}>Sign in to Cooper</Title>
          <Text c="dimmed" size="sm">
            Enter your email and we&apos;ll send you a magic link.
          </Text>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Email"
            placeholder="you@company.com"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <Button type="submit" loading={loading} fullWidth>
            Send magic link
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
```

- [ ] **Step 3: Create the login page**

Create `src/app/auth/login/page.tsx`:

```tsx
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 4: Create the auth callback route handler**

Create `src/app/auth/callback/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/chat`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login`);
}
```

- [ ] **Step 5: Create the sign out route handler**

Create `src/app/auth/signout/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/auth/login`, { status: 302 });
}
```

- [ ] **Step 6: Verify the auth flow works**

Run: `pnpm dev`

1. Navigate to `http://localhost:3000/chat` — should redirect to `/auth/login`
2. Enter your email, submit — should show "Check your email" message
3. Click the magic link in your email — should redirect to `/chat`

- [ ] **Step 7: Commit**

```bash
git add src/middleware.ts src/app/auth/ src/components/auth/
git commit -m "feat: add magic link auth with middleware, login page, and callback"
```

---

## Task 5: Reorganize Routes — Marketing vs App

**Files:**
- Create: `src/app/(marketing)/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/(marketing)/page.tsx`
- Modify: `src/app/layout.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/chat/page.tsx` (placeholder)

- [ ] **Step 1: Create marketing route group layout**

Create `src/app/(marketing)/layout.tsx`:

```tsx
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Move existing landing page into marketing group**

Move `src/app/page.tsx` to `src/app/(marketing)/page.tsx`. The content stays the same — it already imports Navbar, Hero, etc.

- [ ] **Step 3: Simplify root layout to providers only**

Modify `src/app/layout.tsx` — keep only the MantineProvider and font setup. Remove any marketing-specific content (there shouldn't be any, but verify):

```tsx
import "@mantine/core/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { theme } from "@/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Cooper — The AI Teammate That Actually Does the Work",
  description:
    "Cooper is an AI teammate that truly works like an embedded person on your team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-mantine-color-scheme="light" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Create app layout with sidebar shell**

Create `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { AppShell, Burger, Group, Text } from '@mantine/core';
import { createClient } from '@/lib/supabase/server';
import { ChatSidebar } from '@/components/chat/ChatSidebar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  return (
    <AppShell
      navbar={{ width: 280, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Navbar p="md">
        <ChatSidebar />
      </AppShell.Navbar>
      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
```

- [ ] **Step 5: Create placeholder chat page**

Create `src/app/(app)/chat/page.tsx`:

```tsx
import { EmptyState } from '@/components/chat/EmptyState';

export default function ChatPage() {
  return <EmptyState />;
}
```

- [ ] **Step 6: Create placeholder EmptyState and ChatSidebar components**

Create `src/components/chat/EmptyState.tsx`:

```tsx
import { Stack, Title, Text } from '@mantine/core';

export function EmptyState() {
  return (
    <Stack align="center" justify="center" h="100%" gap="md">
      <Title order={2}>Welcome to Cooper</Title>
      <Text c="dimmed">Start a new conversation to get going.</Text>
    </Stack>
  );
}
```

Create `src/components/chat/ChatSidebar.tsx`:

```tsx
'use client';

import { Stack, Button, Text, NavLink } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

export function ChatSidebar() {
  const router = useRouter();

  return (
    <Stack h="100%" gap="sm">
      <Button
        leftSection={<IconPlus size={16} />}
        variant="light"
        fullWidth
        onClick={() => router.push('/chat')}
      >
        New chat
      </Button>
      <Text size="xs" c="dimmed" mt="md">
        No conversations yet
      </Text>
    </Stack>
  );
}
```

- [ ] **Step 7: Verify both routes work**

Run: `pnpm dev`

1. `http://localhost:3000/` — should show the marketing landing page
2. `http://localhost:3000/chat` — should show the app shell (or redirect to login if not authenticated)

- [ ] **Step 8: Commit**

```bash
git add src/app/ src/components/chat/
git commit -m "feat: reorganize routes into marketing and app groups with app shell"
```

---

## Task 6: Agent Engine

**Files:**
- Create: `src/modules/agent/types.ts`
- Create: `src/modules/agent/engine.ts`

The agent engine is the vendor-agnostic boundary. The rest of the app calls `createAgentStream()` and doesn't know what SDK is inside. When swapping to LangChain later, you rewrite `engine.ts` internals — callers don't change.

- [ ] **Step 1: Create agent types**

Create `src/modules/agent/types.ts`:

```typescript
export interface AgentInput {
  threadId: string;
  orgId: string;
  userId: string;
  messages: AgentMessage[];
  modelOverride?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown[];
}
```

- [ ] **Step 2: Create the agent engine**

Create `src/modules/agent/engine.ts`:

```typescript
import { streamText, convertToModelMessages, UIMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { AgentInput } from './types';

const MODELS: Record<string, string> = {
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-opus': 'claude-opus-4-20250514',
};

const DEFAULT_MODEL = 'claude-sonnet';

const SYSTEM_PROMPT = `You are Cooper, an AI teammate. You are helpful, concise, and action-oriented.
You help users with their work by connecting to their tools and completing tasks.
Be direct and professional. Use markdown formatting when it helps readability.`;

export function createAgentStream(input: AgentInput) {
  const modelId = input.modelOverride || DEFAULT_MODEL;
  const modelName = MODELS[modelId] || MODELS[DEFAULT_MODEL];

  const result = streamText({
    model: anthropic(modelName),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(input.messages as UIMessage[]),
    onError: ({ error }) => {
      console.error('[agent] Stream error:', error);
    },
  });

  return result;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm build`

You may see type errors if `convertToModelMessages` expects specific types. If so, adjust the cast. The key is that it compiles — we'll test the full flow end-to-end in Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/modules/
git commit -m "feat: add agent engine with AI SDK implementation"
```

---

## Task 7: Chat API Route

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: Create the chat streaming API route**

Create `src/app/api/chat/route.ts`:

```typescript
import { UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { createAgentStream } from '@/modules/agent/engine';

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get the user's org
  const { data: dbUser } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    return new Response('User not found', { status: 404 });
  }

  const { messages, threadId } = (await req.json()) as {
    messages: UIMessage[];
    threadId?: string;
  };

  const result = createAgentStream({
    threadId: threadId || 'new',
    orgId: dbUser.org_id,
    userId: user.id,
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : '',
    })),
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/chat/
git commit -m "feat: add chat streaming API route with auth"
```

---

## Task 8: Chat UI Components

**Files:**
- Create: `src/components/chat/ChatMessages.tsx`
- Create: `src/components/chat/ChatInput.tsx`
- Create: `src/components/chat/MessageBubble.tsx`
- Create: `src/app/(app)/chat/[threadId]/page.tsx`
- Modify: `src/components/chat/ChatSidebar.tsx`
- Modify: `src/app/(app)/chat/page.tsx`

- [ ] **Step 1: Create the MessageBubble component**

Create `src/components/chat/MessageBubble.tsx`:

```tsx
'use client';

import { Paper, Text, Box } from '@mantine/core';

interface MessageBubbleProps {
  role: string;
  parts: Array<{ type: string; text?: string }>;
}

export function MessageBubble({ role, parts }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      <Paper
        p="sm"
        radius="lg"
        maw="70%"
        style={{
          backgroundColor: isUser ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-gray-0)',
        }}
      >
        {parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <Text
                key={i}
                size="sm"
                c={isUser ? 'white' : undefined}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {part.text}
              </Text>
            );
          }
          return null;
        })}
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 2: Create the ChatMessages component**

Create `src/components/chat/ChatMessages.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { ScrollArea, Stack } from '@mantine/core';
import { MessageBubble } from './MessageBubble';

interface ChatMessagesProps {
  messages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string }>;
  }>;
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  return (
    <ScrollArea h="calc(100vh - 180px)" viewportRef={viewportRef}>
      <Stack gap={0} p="md">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            role={message.role}
            parts={message.parts}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}
```

- [ ] **Step 3: Create the ChatInput component**

Create `src/components/chat/ChatInput.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Textarea, ActionIcon, Group, Box } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
      <Group gap="sm" align="flex-end">
        <Textarea
          placeholder="Message Cooper..."
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          autosize
          minRows={1}
          maxRows={5}
          style={{ flex: 1 }}
          disabled={disabled}
        />
        <ActionIcon
          size="lg"
          variant="filled"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          <IconSend size={18} />
        </ActionIcon>
      </Group>
    </Box>
  );
}
```

- [ ] **Step 4: Create the chat thread page with useChat**

Create `src/app/(app)/chat/[threadId]/page.tsx`:

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { Stack } from '@mantine/core';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { useParams } from 'next/navigation';
import { DefaultChatTransport } from '@ai-sdk/react';

export default function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { threadId },
    }),
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  return (
    <Stack h="100vh" gap={0} justify="space-between">
      <ChatMessages messages={messages as any} />
      <ChatInput
        onSend={(content) => sendMessage({ content })}
        disabled={isStreaming}
      />
    </Stack>
  );
}
```

- [ ] **Step 5: Update the chat index page to create a new thread on first message**

Update `src/app/(app)/chat/page.tsx`:

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { Stack } from '@mantine/core';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { DefaultChatTransport } from '@ai-sdk/react';

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const isStreaming = status === 'streaming' || status === 'submitted';
  const hasMessages = messages.length > 0;

  return (
    <Stack h="100vh" gap={0} justify="space-between">
      {hasMessages ? (
        <ChatMessages messages={messages as any} />
      ) : (
        <EmptyState />
      )}
      <ChatInput
        onSend={(content) => sendMessage({ content })}
        disabled={isStreaming}
      />
    </Stack>
  );
}
```

- [ ] **Step 6: Verify the chat flow end-to-end**

Run: `pnpm dev`

1. Sign in via magic link
2. Navigate to `/chat`
3. Type a message and send
4. Should see Cooper's streaming response appear

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ src/app/\(app\)/chat/
git commit -m "feat: add chat UI with streaming messages, input, and useChat integration"
```

---

## Task 9: Thread Persistence — Save Messages to Supabase

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/components/chat/ChatSidebar.tsx`
- Modify: `src/app/(app)/chat/[threadId]/page.tsx`

- [ ] **Step 1: Update the chat API route to persist messages**

Replace `src/app/api/chat/route.ts`:

```typescript
import { UIMessage, appendResponseMessages } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { createAgentStream } from '@/modules/agent/engine';

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: dbUser } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!dbUser) {
    return new Response('User not found', { status: 404 });
  }

  const { messages, threadId } = (await req.json()) as {
    messages: UIMessage[];
    threadId?: string;
  };

  // Create or reuse thread
  let activeThreadId = threadId;
  if (!activeThreadId || activeThreadId === 'new') {
    const firstMessage = messages[messages.length - 1];
    const title = typeof firstMessage?.content === 'string'
      ? firstMessage.content.slice(0, 100)
      : 'New conversation';

    const { data: thread } = await supabase
      .from('threads')
      .insert({
        org_id: dbUser.org_id,
        user_id: user.id,
        title,
      })
      .select('id')
      .single();

    activeThreadId = thread?.id;
  }

  // Save the latest user message
  const lastUserMessage = messages[messages.length - 1];
  if (lastUserMessage && lastUserMessage.role === 'user') {
    await supabase.from('messages').insert({
      thread_id: activeThreadId,
      role: 'user',
      content: typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content),
    });
  }

  const result = createAgentStream({
    threadId: activeThreadId!,
    orgId: dbUser.org_id,
    userId: user.id,
    messages: messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : '',
    })),
  });

  // Save assistant response after stream completes
  result.then(async (r) => {
    const response = await r;
    const text = await response.text;
    if (text && activeThreadId) {
      const serverSupabase = await createClient();
      await serverSupabase.from('messages').insert({
        thread_id: activeThreadId,
        role: 'assistant',
        content: text,
        metadata: {
          model: 'claude-sonnet',
        },
      });

      // Update thread timestamp
      await serverSupabase
        .from('threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeThreadId);
    }
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
    headers: {
      'X-Thread-Id': activeThreadId || '',
    },
  });
}
```

- [ ] **Step 2: Update ChatSidebar to load threads from Supabase**

Replace `src/components/chat/ChatSidebar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Stack, Button, Text, NavLink } from '@mantine/core';
import { IconPlus, IconMessage } from '@tabler/icons-react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Thread } from '@/lib/types';

export function ChatSidebar() {
  const router = useRouter();
  const params = useParams();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function loadThreads() {
      const { data } = await supabase
        .from('threads')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (data) setThreads(data);
    }

    loadThreads();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('threads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'threads' },
        () => loadThreads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Stack h="100%" gap="sm">
      <Button
        leftSection={<IconPlus size={16} />}
        variant="light"
        fullWidth
        onClick={() => router.push('/chat')}
      >
        New chat
      </Button>

      <Stack gap={4} mt="md" style={{ flex: 1, overflow: 'auto' }}>
        {threads.length === 0 && (
          <Text size="xs" c="dimmed">No conversations yet</Text>
        )}
        {threads.map((thread) => (
          <NavLink
            key={thread.id}
            label={thread.title || 'Untitled'}
            leftSection={<IconMessage size={16} />}
            active={params?.threadId === thread.id}
            onClick={() => router.push(`/chat/${thread.id}`)}
            style={{ borderRadius: 'var(--mantine-radius-md)' }}
          />
        ))}
      </Stack>
    </Stack>
  );
}
```

- [ ] **Step 3: Update thread page to load existing messages**

Replace `src/app/(app)/chat/[threadId]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Stack, Loader, Center } from '@mantine/core';
import { ChatMessages } from '@/components/chat/ChatMessages';
import { ChatInput } from '@/components/chat/ChatInput';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DefaultChatTransport } from '@ai-sdk/react';
import type { Message } from '@/lib/types';

export default function ChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const [initialMessages, setInitialMessages] = useState<any[] | null>(null);

  useEffect(() => {
    async function loadMessages() {
      const supabase = createClient();
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (data) {
        setInitialMessages(
          data.map((m: Message) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            parts: [{ type: 'text', text: m.content }],
          }))
        );
      } else {
        setInitialMessages([]);
      }
    }

    loadMessages();
  }, [threadId]);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { threadId },
    }),
    initialMessages: initialMessages || undefined,
  });

  if (initialMessages === null) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  const isStreaming = status === 'streaming' || status === 'submitted';

  return (
    <Stack h="100vh" gap={0} justify="space-between">
      <ChatMessages messages={messages as any} />
      <ChatInput
        onSend={(content) => sendMessage({ content })}
        disabled={isStreaming}
      />
    </Stack>
  );
}
```

- [ ] **Step 4: Enable Supabase Realtime for threads table**

In the Supabase dashboard:
1. Go to Database → Replication
2. Enable Realtime for the `threads` table

- [ ] **Step 5: Verify thread persistence end-to-end**

Run: `pnpm dev`

1. Start a new conversation — message should appear in sidebar
2. Refresh the page — thread and messages should persist
3. Click a thread in the sidebar — should load that conversation
4. Send another message — should append to the existing thread

- [ ] **Step 6: Commit**

```bash
git add src/app/api/chat/ src/components/chat/ src/app/\(app\)/chat/
git commit -m "feat: persist threads and messages to supabase with realtime sidebar"
```

---

## Task 10: Sign Out + Polish

**Files:**
- Modify: `src/components/chat/ChatSidebar.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Add sign out button to sidebar**

In `src/components/chat/ChatSidebar.tsx`, add a sign-out button at the bottom of the sidebar. Add this after the thread list `Stack` and before the closing `</Stack>`:

```tsx
// Add to imports:
import { IconLogout } from '@tabler/icons-react';

// Add at bottom of the outer Stack, after the threads Stack:
<Button
  variant="subtle"
  color="gray"
  leftSection={<IconLogout size={16} />}
  fullWidth
  onClick={() => {
    fetch('/auth/signout', { method: 'POST' }).then(() => {
      window.location.href = '/auth/login';
    });
  }}
>
  Sign out
</Button>
```

- [ ] **Step 2: Verify sign out works**

Run: `pnpm dev`

1. Click "Sign out" — should redirect to login page
2. Try navigating to `/chat` — should redirect to login

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatSidebar.tsx
git commit -m "feat: add sign out button to chat sidebar"
```

---

## Task 11: Build Verification

- [ ] **Step 1: Run the build**

```bash
pnpm build
```

Fix any type errors or build issues.

- [ ] **Step 2: Run the production build locally**

```bash
pnpm start
```

Test the full flow:
1. Landing page at `/`
2. Login at `/auth/login`
3. Magic link flow
4. Chat at `/chat`
5. Send message, see streaming response
6. Thread appears in sidebar
7. Refresh — thread persists
8. Sign out

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues for phase 1"
```

---

## Summary

After completing all tasks, you'll have:
- Supabase with auth (magic link), threads, messages, and RLS
- A vendor-agnostic agent engine calling Claude via the Vercel AI SDK
- A web chat UI with streaming responses, thread persistence, and a sidebar
- Marketing landing page untouched at `/`
- Auth middleware protecting the `/chat` routes
- Ready for Phase 2 (connections & tools)
