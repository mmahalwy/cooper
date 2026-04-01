import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackUsage, UsageEntry } from './usage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    orgId: 'org-123',
    modelId: 'gemini-2.5-flash',
    modelProvider: 'google',
    promptTokens: 1000,
    completionTokens: 500,
    source: 'chat',
    ...overrides,
  };
}

function makeSupabase() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  return { supabase: { from } as any, insert, from };
}

// ---------------------------------------------------------------------------
// Cost estimation (via trackUsage observable side-effects)
// ---------------------------------------------------------------------------

describe('cost estimation', () => {
  it('calculates cost correctly for gemini-2.5-flash', async () => {
    const { supabase, insert } = makeSupabase();

    // input: 1 000 000 tokens @ $0.15/M = $0.15
    // output:   500 000 tokens @ $0.60/M = $0.30
    // total: $0.45
    await trackUsage(supabase, makeEntry({ promptTokens: 1_000_000, completionTokens: 500_000 }));

    const row = insert.mock.calls[0][0];
    expect(row.estimated_cost_usd).toBeCloseTo(0.45, 6);
  });

  it('calculates cost correctly for claude-sonnet-4-20250514', async () => {
    const { supabase, insert } = makeSupabase();

    // input: 2 000 000 tokens @ $3.00/M = $6.00
    // output: 1 000 000 tokens @ $15.00/M = $15.00
    // total: $21.00
    await trackUsage(
      supabase,
      makeEntry({
        modelId: 'claude-sonnet-4-20250514',
        modelProvider: 'anthropic',
        promptTokens: 2_000_000,
        completionTokens: 1_000_000,
      }),
    );

    const row = insert.mock.calls[0][0];
    expect(row.estimated_cost_usd).toBeCloseTo(21.0, 6);
  });

  it('returns 0 cost for an unknown model', async () => {
    const { supabase, insert } = makeSupabase();

    await trackUsage(supabase, makeEntry({ modelId: 'gpt-99-turbo', promptTokens: 500, completionTokens: 500 }));

    const row = insert.mock.calls[0][0];
    expect(row.estimated_cost_usd).toBe(0);
  });

  it('returns 0 cost when both token counts are zero', async () => {
    const { supabase, insert } = makeSupabase();

    await trackUsage(supabase, makeEntry({ promptTokens: 0, completionTokens: 0 }));

    const row = insert.mock.calls[0][0];
    expect(row.estimated_cost_usd).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Token counting
// ---------------------------------------------------------------------------

describe('total_tokens', () => {
  it('is the sum of promptTokens and completionTokens', async () => {
    const { supabase, insert } = makeSupabase();

    await trackUsage(supabase, makeEntry({ promptTokens: 300, completionTokens: 200 }));

    const row = insert.mock.calls[0][0];
    expect(row.total_tokens).toBe(500);
  });

  it('is 0 when both token counts are zero', async () => {
    const { supabase, insert } = makeSupabase();

    await trackUsage(supabase, makeEntry({ promptTokens: 0, completionTokens: 0 }));

    const row = insert.mock.calls[0][0];
    expect(row.total_tokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// trackUsage — supabase insert behaviour
// ---------------------------------------------------------------------------

describe('trackUsage', () => {
  let supabase: any;
  let insert: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ supabase, insert, from } = makeSupabase());
  });

  it('calls supabase.from("usage_logs")', async () => {
    await trackUsage(supabase, makeEntry());
    expect(from).toHaveBeenCalledWith('usage_logs');
  });

  it('inserts exactly one row', async () => {
    await trackUsage(supabase, makeEntry());
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('maps entry fields to the correct column names', async () => {
    const entry = makeEntry({
      orgId: 'org-abc',
      userId: 'user-xyz',
      threadId: 'thread-001',
      modelId: 'gemini-2.5-flash',
      modelProvider: 'google',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 1234,
      source: 'scheduler',
    });

    await trackUsage(supabase, entry);

    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      org_id: 'org-abc',
      user_id: 'user-xyz',
      thread_id: 'thread-001',
      model_id: 'gemini-2.5-flash',
      model_provider: 'google',
      prompt_tokens: 100,
      completion_tokens: 50,
      latency_ms: 1234,
      source: 'scheduler',
    });
  });

  it('sets user_id and thread_id to null when omitted', async () => {
    await trackUsage(supabase, makeEntry({ userId: undefined, threadId: undefined }));

    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBeNull();
    expect(row.thread_id).toBeNull();
  });

  it('sets latency_ms to null when omitted', async () => {
    await trackUsage(supabase, makeEntry({ latencyMs: undefined }));

    const row = insert.mock.calls[0][0];
    expect(row.latency_ms).toBeNull();
  });

  it('does not throw when supabase returns an error', async () => {
    insert.mockResolvedValueOnce({ error: new Error('DB error') });

    await expect(trackUsage(supabase, makeEntry())).resolves.toBeUndefined();
  });

  it('does not throw when supabase rejects', async () => {
    insert.mockRejectedValueOnce(new Error('network failure'));

    await expect(trackUsage(supabase, makeEntry())).resolves.toBeUndefined();
  });
});
