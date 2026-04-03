import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveSlackUser } from '../users';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSupabase(overrides: Record<string, any> = {}) {
  const chainable = (result: any): any => ({
    select: () => chainable(result),
    eq: () => chainable(result),
    single: () => Promise.resolve(result),
    limit: () => chainable(result),
    order: () => chainable(result),
    insert: () => Promise.resolve({ error: null }),
    catch: (fn: (e: any) => any) => Promise.resolve({ error: null }),
  });

  return {
    from: (table: string) => {
      if (overrides[table] !== undefined) return chainable(overrides[table]);
      return chainable({ data: null, error: null });
    },
  } as any;
}

const mockSlackClient = {
  users: {
    info: vi.fn(),
  },
} as any;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLACK_USER_ID = 'U111';
const SLACK_TEAM_ID = 'T111';
const ORG_ID = 'org-abc';
const USER_ID = 'user-xyz';
const ADMIN_ID = 'admin-user';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSlackUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns immediately when an existing mapping is found', async () => {
    const supabase = mockSupabase({
      slack_user_mappings: { data: { user_id: USER_ID, org_id: ORG_ID }, error: null },
    });

    const result = await resolveSlackUser(supabase, mockSlackClient, SLACK_USER_ID, SLACK_TEAM_ID, ORG_ID);

    expect(result).toEqual({ userId: USER_ID, orgId: ORG_ID });
    // Slack API should not have been called because we short-circuited
    expect(mockSlackClient.users.info).not.toHaveBeenCalled();
  });

  it('creates a mapping and returns the user when email matches an existing Cooper user', async () => {
    // No existing mapping
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: (table: string) => {
        if (table === 'slack_user_mappings') {
          // First call: lookup → not found; subsequent calls: insert
          let called = false;
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => {
                    if (!called) {
                      called = true;
                      return Promise.resolve({ data: null, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                }),
              }),
            }),
            insert: insertFn,
          };
        }
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({ data: { id: USER_ID, org_id: ORG_ID }, error: null }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
      },
    } as any;

    mockSlackClient.users.info.mockResolvedValue({
      user: { profile: { email: 'alice@example.com' }, real_name: 'Alice', name: 'alice' },
    });

    const result = await resolveSlackUser(supabase, mockSlackClient, SLACK_USER_ID, SLACK_TEAM_ID, ORG_ID);

    expect(result).toEqual({ userId: USER_ID, orgId: ORG_ID });
    expect(insertFn).toHaveBeenCalledWith({
      slack_user_id: SLACK_USER_ID,
      slack_team_id: SLACK_TEAM_ID,
      user_id: USER_ID,
      org_id: ORG_ID,
    });
  });

  it('falls back to org admin when no email match exists', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });

    // Track which call to 'users' we're on so we can return different values
    let usersCallCount = 0;

    const supabase = {
      from: (table: string) => {
        if (table === 'slack_user_mappings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
              }),
            }),
            insert: () => ({
              catch: (fn: any) => Promise.resolve({ error: null }),
            }),
          };
        }
        if (table === 'users') {
          usersCallCount++;
          if (usersCallCount === 1) {
            // Email lookup — no match
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
                }),
              }),
            };
          }
          // Admin fallback — found
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    single: () =>
                      Promise.resolve({ data: { id: ADMIN_ID, org_id: ORG_ID }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
      },
    } as any;

    mockSlackClient.users.info.mockResolvedValue({
      user: { profile: { email: 'unknown@example.com' }, real_name: 'Unknown', name: 'unknown' },
    });

    const result = await resolveSlackUser(supabase, mockSlackClient, SLACK_USER_ID, SLACK_TEAM_ID, ORG_ID);

    expect(result).toEqual({ userId: ADMIN_ID, orgId: ORG_ID });
  });

  it('returns null when no mapping, no email match, and no admin user found', async () => {
    const supabase = mockSupabase({
      // slack_user_mappings: not found
      slack_user_mappings: { data: null, error: null },
      // users: not found (covers both email lookup and admin fallback)
      users: { data: null, error: null },
    });

    mockSlackClient.users.info.mockResolvedValue({
      user: { profile: { email: 'ghost@example.com' }, real_name: 'Ghost', name: 'ghost' },
    });

    const result = await resolveSlackUser(supabase, mockSlackClient, SLACK_USER_ID, SLACK_TEAM_ID, ORG_ID);

    expect(result).toBeNull();
  });

  it('falls back to admin when Slack API throws an error fetching the profile', async () => {
    let usersCallCount = 0;

    const supabase = {
      from: (table: string) => {
        if (table === 'slack_user_mappings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
              }),
            }),
            insert: () => ({
              catch: (fn: any) => Promise.resolve({ error: null }),
            }),
          };
        }
        if (table === 'users') {
          usersCallCount++;
          // Since there's no email (Slack API failed), the email-match branch is
          // skipped entirely. The only 'users' query is the admin fallback.
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    single: () =>
                      Promise.resolve({ data: { id: ADMIN_ID, org_id: ORG_ID }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
      },
    } as any;

    mockSlackClient.users.info.mockRejectedValue(new Error('Slack API unavailable'));

    const result = await resolveSlackUser(supabase, mockSlackClient, SLACK_USER_ID, SLACK_TEAM_ID, ORG_ID);

    // Should have fallen back to admin despite the Slack error
    expect(result).toEqual({ userId: ADMIN_ID, orgId: ORG_ID });
    expect(usersCallCount).toBe(1); // Only the admin query, no email query
  });

  it('handles a duplicate mapping gracefully (upsert does not throw)', async () => {
    // insert returning an error should not surface — the function ignores it via .catch(()=>{})
    const supabase = {
      from: (table: string) => {
        if (table === 'slack_user_mappings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
              }),
            }),
            insert: () => ({
              // Simulate a unique-constraint conflict
              catch: (fn: any) => {
                fn(new Error('duplicate key value violates unique constraint'));
                return Promise.resolve({ error: { message: 'duplicate' } });
              },
            }),
          };
        }
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    single: () =>
                      Promise.resolve({ data: { id: ADMIN_ID, org_id: ORG_ID }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
      },
    } as any;

    // Slack API fails → no email → goes straight to admin fallback
    mockSlackClient.users.info.mockRejectedValue(new Error('rate limited'));

    const result = await resolveSlackUser(supabase, mockSlackClient, SLACK_USER_ID, SLACK_TEAM_ID, ORG_ID);

    // Should succeed despite the insert conflict
    expect(result).toEqual({ userId: ADMIN_ID, orgId: ORG_ID });
  });
});
