import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateObjectMock, googleMock, addKnowledgeMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
  googleMock: vi.fn(),
  addKnowledgeMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

vi.mock('@ai-sdk/google', () => ({
  google: googleMock,
}));

vi.mock('./knowledge', () => ({
  addKnowledge: addKnowledgeMock,
}));

import { extractAndSaveMemories } from './extractor';

describe('extractAndSaveMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    googleMock.mockReturnValue({ id: 'mock-google-model' });
  });

  it('saves both org-scoped and user-scoped facts with the correct scope', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        facts: [
          {
            content: 'The engineering team uses Linear for issue tracking.',
            category: 'tool',
            scope: 'org',
          },
          {
            content: 'This user prefers bullet points in updates.',
            category: 'preference',
            scope: 'user',
          },
        ],
      },
    });
    addKnowledgeMock.mockResolvedValue({ id: 'knowledge-1' });

    await extractAndSaveMemories(
      {} as never,
      'org-1',
      'user-1',
      'Please remember how we work.',
      'Noted.',
      ['Deploys happen on Fridays.'],
    );

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(addKnowledgeMock).toHaveBeenNthCalledWith(
      1,
      {} as never,
      'org-1',
      'The engineering team uses Linear for issue tracking.',
      'conversation',
      undefined,
    );
    expect(addKnowledgeMock).toHaveBeenNthCalledWith(
      2,
      {} as never,
      'org-1',
      'This user prefers bullet points in updates.',
      'conversation',
      'user-1',
    );
  });

  it('does not write anything when the extractor returns no facts', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        facts: [],
      },
    });

    await extractAndSaveMemories(
      {} as never,
      'org-1',
      'user-1',
      'hello',
      'hi',
      [],
    );

    expect(addKnowledgeMock).not.toHaveBeenCalled();
  });

  it('swallows extraction failures so chat flow is not interrupted', async () => {
    generateObjectMock.mockRejectedValue(new Error('provider failed'));

    await expect(
      extractAndSaveMemories(
        {} as never,
        'org-1',
        'user-1',
        'remember this',
        'okay',
        [],
      ),
    ).resolves.toBeUndefined();

    expect(addKnowledgeMock).not.toHaveBeenCalled();
  });
});
