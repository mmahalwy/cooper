import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the skills system module — it uses 'fs' and embeddings (server-only)
vi.mock('@/modules/skills/system', () => ({
  buildSkillsPrompt: vi.fn().mockResolvedValue(''),
}));

import { buildSlackSystemPrompt } from '../system-prompt';

function makeSupabase(orgSettings: Record<string, unknown> | null = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: orgSettings }),
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

const baseMemory = {
  knowledge: [],
  matchedSkills: [],
  threadSummaries: [],
};

describe('buildSlackSystemPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a string', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(typeof result).toBe('string');
  });

  it('includes Slack mrkdwn formatting rules', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(result).toContain('mrkdwn');
    expect(result).toContain('single asterisks');
  });

  it('mentions that ** does not work in Slack', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(result).toContain('**');
  });

  it('includes tool usage section', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(result).toContain('Tool Usage');
    expect(result).toContain('use_integration');
  });

  it("includes today's date in the prompt", async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(result).toMatch(/TODAY is \w+,/);
  });

  it('includes connected integrations when provided', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      ['slack', 'linear'],
      'hello'
    );
    expect(result).toContain('Connected Integrations');
    expect(result).toContain('slack');
    expect(result).toContain('linear');
  });

  it('does not mention Composio to the user', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      ['slack'],
      'hello'
    );
    // The prompt instructs Cooper not to mention Composio — that instruction must be present
    expect(result).toContain('Do NOT mention "Composio"');
  });

  it('omits connected integrations section when none provided', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(result).not.toContain('Connected Integrations');
  });

  it('injects knowledge when memoryContext has entries', async () => {
    const memory = {
      ...baseMemory,
      knowledge: ['The team uses Notion for docs', 'Deploys happen on Fridays'],
    };
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      memory,
      [],
      'hello'
    );
    expect(result).toContain('Things you know about this organization');
    expect(result).toContain('The team uses Notion for docs');
    expect(result).toContain('Deploys happen on Fridays');
  });

  it('injects relevant skills when memoryContext has matched skills', async () => {
    const memory = {
      ...baseMemory,
      matchedSkills: [
        {
          id: 'skill-1',
          name: 'Deploy checker',
          description: 'Checks deploy status',
          trigger: 'deploy',
          steps: [],
          tools: [],
        },
      ],
    };
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      memory,
      [],
      'hello'
    );
    expect(result).toContain('Relevant skills');
    expect(result).toContain('Deploy checker');
  });

  it('includes conversation summary when provided', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello',
      { conversationSummary: 'We talked about the Q1 launch.' }
    );
    expect(result).toContain('Earlier Conversation Summary');
    expect(result).toContain('We talked about the Q1 launch.');
  });

  it('includes first interaction note when isFirstMessage is true', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase(),
      'org-1',
      baseMemory,
      [],
      'hello',
      { isFirstMessage: true }
    );
    expect(result).toContain('First Interaction');
  });

  it('applies org persona name when set', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase({ persona_name: 'Aria', persona_instructions: null, persona_tone: null }),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(result).toContain('Aria');
  });

  it('applies org persona instructions when set', async () => {
    const result = await buildSlackSystemPrompt(
      makeSupabase({
        persona_name: 'Aria',
        persona_instructions: 'Always respond in bullet points.',
        persona_tone: 'casual',
      }),
      'org-1',
      baseMemory,
      [],
      'hello'
    );
    expect(result).toContain('Communication Style');
    expect(result).toContain('Always respond in bullet points.');
    expect(result).toContain('casual');
  });
});
