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
  similar = [] as Array<{
    id: string;
    similarity: number;
    content: string;
    source: string;
  }>,
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
  const insertSingleMock = vi.fn().mockResolvedValue({ data: insertResult, error: null });
  const updateSingleMock = vi.fn().mockResolvedValue({ data: updateResult, error: null });
  const insertSelectMock = vi.fn(() => ({ single: insertSingleMock }));
  const updateSelectMock = vi.fn(() => ({ single: updateSingleMock }));
  const insertMock = vi.fn(() => ({ select: insertSelectMock }));
  const updateEqMock = vi.fn(() => ({ select: updateSelectMock }));
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
      insertSelectMock,
      updateSelectMock,
      insertSingleMock,
      updateSingleMock,
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
