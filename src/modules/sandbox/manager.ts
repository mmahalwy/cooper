/**
 * Sandbox session manager — one sandbox per thread, auto-cleanup after inactivity.
 */

import type { SandboxSession } from './types';
import { E2BSession } from './e2b';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface ManagedSession {
  session: SandboxSession;
  timer: ReturnType<typeof setTimeout>;
}

/** In-memory map of threadId → active sandbox session. */
const sessions = new Map<string, ManagedSession>();

function scheduleCleanup(key: string): ReturnType<typeof setTimeout> {
  return setTimeout(async () => {
    const entry = sessions.get(key);
    if (!entry) return;
    console.log(`[sandbox] Closing idle session for thread ${key}`);
    sessions.delete(key);
    await entry.session.close();
  }, IDLE_TIMEOUT_MS);
}

/**
 * Get or create a sandbox session scoped to a thread.
 * Each call resets the idle timer so the session stays alive while in use.
 */
export function getOrCreateSession(orgId: string, threadId: string): SandboxSession {
  const key = `${orgId}:${threadId}`;

  const existing = sessions.get(key);
  if (existing) {
    // Reset idle timer
    clearTimeout(existing.timer);
    existing.timer = scheduleCleanup(key);
    return existing.session;
  }

  const session = new E2BSession();
  const timer = scheduleCleanup(key);
  sessions.set(key, { session, timer });
  console.log(`[sandbox] Created new session for thread ${key}`);
  return session;
}

/**
 * Explicitly close a session (e.g. when a thread ends).
 */
export async function closeSession(orgId: string, threadId: string): Promise<void> {
  const key = `${orgId}:${threadId}`;
  const entry = sessions.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  sessions.delete(key);
  await entry.session.close();
}
