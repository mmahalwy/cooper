import { beforeEach, describe, expect, it, vi } from 'vitest';

const { embedMock } = vi.hoisted(() => ({
  embedMock: vi.fn(),
}));

vi.mock('./embeddings', () => ({
  embeddingProvider: {
    embed: embedMock,
  },
}));

import { addKnowledge } from './knowledge';

function makeSupabase({
  similar = [],
  insertResult = {
    id: 'knowledge-1',
    org_id: 'org-1',
    user_id: null,
    content: 'The team uses Linear.',
    source: 'conversation',
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
  },
  updateResult = {
    id: 'knowledge-1',
    org_id: 'org-1',
    user_id: null,
    content: 'The team uses Linear for issue tracking.',
    source: 'conversation',
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
  },
} = {}) {
  const singleMock = vi
    .fn()
    .mockResolvedValueOnce({ data: insertResult, error: null })
    .mockResolvedValueOnce({ data: updateResult, error: null });

  const selectMock = vi.fn(() => ({ single: singleMock }));
  const insertMock = vi.fn(() => ({ select: selectMock }));
  const updateEqMock = vi.fn(() => ({ select: selectMock }));
  const updateMock = vi.fn(() => ({ eq: updateEqMock }));

  return {
    rpc: vi.fn().mockResolvedValue({ data: similar }),
    from: vi.fn(() => ({
      insert: insertMock,
      update: updateMock,
    })),
    __mocks: {
      insertMock,
      updateMock,
      selectMock,
      singleMock,
    },
  } as const;
}

describe('addKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedMock.mockResolvedValue([1, 0, 0]);
  });

  it('inserts a new fact when no similar knowledge exists', async () => {
    const supabase = makeSupabase({ similar: [] });

    const result = await addKnowledge(
      supabase as never,
      'org-1',
      'The team uses Linear.',
      'conversation',
    );

    expect(supabase.rpc).toHaveBeenCalledWith('match_knowledge', {
      query_embedding: [1, 0, 0],
      match_org_id: 'org-1',
      match_count: 1,
      match_threshold: 0.70,
      match_user_id: null,
    });
    expect(supabase.__mocks.insertMock).toHaveBeenCalledWith({
      org_id: 'org-1',
      user_id: null,
      content: 'The team uses Linear.',
      source: 'conversation',
      embedding: [1, 0, 0],
    });
    expect(result?.content).toBe('The team uses Linear.');
  });

  it('returns the existing fact and skips insert for near-duplicates', async () => {
    const supabase = makeSupabase({
      similar: [
        {
          id: 'knowledge-existing',
          similarity: 0.91,
          content: 'The team uses Linear.',
          source: 'conversation',
        },
      ],
    });

    const result = await addKnowledge(
      supabase as never,
      'org-1',
      'We use Linear for issue tracking.',
      'conversation',
    );

    expect(supabase.__mocks.insertMock).not.toHaveBeenCalled();
    expect(supabase.__mocks.updateMock).not.toHaveBeenCalled();
    expect(result?.id).toBe('knowledge-existing');
    expect(result?.content).toBe('The team uses Linear.');
  });

  it('updates an existing fact when a moderately similar match is found', async () => {
    const supabase = makeSupabase({
      similar: [
        {
          id: 'knowledge-existing',
          similarity: 0.78,
          content: 'The team uses Linear.',
          source: 'conversation',
        },
      ],
    });

    const result = await addKnowledge(
      supabase as never,
      'org-1',
      'The team uses Linear for issue tracking.',
      'conversation',
    );

    expect(supabase.__mocks.insertMock).not.toHaveBeenCalled();
    expect(supabase.__mocks.updateMock).toHaveBeenCalledWith({
      content: 'The team uses Linear for issue tracking.',
      embedding: [1, 0, 0],
      updated_at: expect.any(String),
    });
    expect(result?.content).toBe('The team uses Linear for issue tracking.');
  });
});
