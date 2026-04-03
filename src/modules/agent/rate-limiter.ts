/**
 * Sliding window rate limiter using the existing usage_logs table.
 *
 * No Redis / additional tables required — we count usage_logs rows within
 * the current window to decide whether a request is allowed.
 */

import { SupabaseClient } from '@supabase/supabase-js';

/** Maximum requests per org within the window. */
export const RATE_LIMIT_REQUESTS = 60;

/** Window size in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** How many requests remain in the current window (0 when blocked). */
  remaining: number;
}

/**
 * Check whether `orgId` has exceeded the sliding-window rate limit.
 *
 * Uses `usage_logs` to count requests in the last `RATE_LIMIT_WINDOW_MS`
 * milliseconds.  The table is already indexed on `(org_id, created_at)` via
 * its primary usage queries, so this stays fast.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  orgId: string
): Promise<RateLimitResult> {
  try {
    const windowSeconds = RATE_LIMIT_WINDOW_MS / 1000;

    const { count, error } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString());

    if (error) {
      // On error, fail open — don't block requests because of a DB hiccup.
      console.error('[rate-limiter] Failed to query usage_logs:', error);
      return { allowed: true, remaining: RATE_LIMIT_REQUESTS };
    }

    const currentCount = count ?? 0;
    const remaining = Math.max(0, RATE_LIMIT_REQUESTS - currentCount);
    const allowed = currentCount < RATE_LIMIT_REQUESTS;

    if (!allowed) {
      console.warn(
        `[rate-limiter] Org ${orgId} exceeded rate limit: ${currentCount} requests in ${windowSeconds}s window`
      );
    }

    return { allowed, remaining };
  } catch (err) {
    // Fail open on unexpected errors.
    console.error('[rate-limiter] Unexpected error:', err);
    return { allowed: true, remaining: RATE_LIMIT_REQUESTS };
  }
}
