import { describe, it, expect, vi } from 'vitest';
import type { SlackInstallation } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeInstallation(overrides: Partial<SlackInstallation> = {}): SlackInstallation {
  return {
    id: 'inst-1',
    team_id: 'T123',
    org_id: 'org-1',
    bot_token: 'xoxb-test-token',
    bot_user_id: 'U_BOT',
    installed_by: 'U_USER',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// Chainable Supabase mock builders
function mockSupabaseSingle(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(result),
        }),
      }),
    }),
  } as any;
}

function mockSupabaseOrgId(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              single: () => Promise.resolve(result),
            }),
          }),
        }),
      }),
    }),
  } as any;
}

// ---------------------------------------------------------------------------
// getInstallationByTeamId
// ---------------------------------------------------------------------------

describe('getInstallationByTeamId', () => {
  it('returns the installation when the row is found', async () => {
    const { getInstallationByTeamId } = await import('../installations');
    const installation = makeFakeInstallation();
    const supabase = mockSupabaseSingle({ data: installation, error: null });

    const result = await getInstallationByTeamId(supabase, 'T123');

    expect(result).toEqual(installation);
  });

  it('returns null when no row is found (data is null)', async () => {
    const { getInstallationByTeamId } = await import('../installations');
    const supabase = mockSupabaseSingle({ data: null, error: null });

    const result = await getInstallationByTeamId(supabase, 'T_UNKNOWN');

    expect(result).toBeNull();
  });

  it('returns null when the query returns an error', async () => {
    const { getInstallationByTeamId } = await import('../installations');
    const supabase = mockSupabaseSingle({
      data: null,
      error: { message: 'No rows found', code: 'PGRST116' },
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getInstallationByTeamId(supabase, 'T_BAD');

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });

  it('returns null when both data and error are present but error takes priority', async () => {
    // Edge case: supabase returns stale data alongside an error
    const { getInstallationByTeamId } = await import('../installations');
    const supabase = mockSupabaseSingle({
      data: makeFakeInstallation(),
      error: { message: 'RLS violation', code: '42501' },
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getInstallationByTeamId(supabase, 'T123');

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getInstallationByOrgId
// ---------------------------------------------------------------------------

describe('getInstallationByOrgId', () => {
  it('returns the most recent installation for the org', async () => {
    const { getInstallationByOrgId } = await import('../installations');
    const installation = makeFakeInstallation({ org_id: 'org-abc' });
    const supabase = mockSupabaseOrgId({ data: installation, error: null });

    const result = await getInstallationByOrgId(supabase, 'org-abc');

    expect(result).toEqual(installation);
  });

  it('returns null when no installation exists for the org', async () => {
    const { getInstallationByOrgId } = await import('../installations');
    const supabase = mockSupabaseOrgId({ data: null, error: null });

    const result = await getInstallationByOrgId(supabase, 'org-missing');

    expect(result).toBeNull();
  });

  it('returns null when the query errors', async () => {
    const { getInstallationByOrgId } = await import('../installations');
    const supabase = mockSupabaseOrgId({
      data: null,
      error: { message: 'connection timeout', code: '08001' },
    });

    const result = await getInstallationByOrgId(supabase, 'org-broken');

    expect(result).toBeNull();
  });
});
