import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the lazy-loaded provider modules
const mockAnthropicModel = { id: 'mock-anthropic-model' };
const mockOpenAIModel = { id: 'mock-openai-model' };
const mockGeminiModel = { id: 'mock-gemini-model' };

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => mockAnthropicModel),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => mockOpenAIModel),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => mockGeminiModel),
}));

// Import after mocks are set up
import { selectModel, selectSchedulerModel } from './model-router';

describe('selectModel', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('simple messages (greetings)', () => {
    it('should return Gemini Flash for "hi"', () => {
      const result = selectModel('hi', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "hello"', () => {
      const result = selectModel('hello', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "hey"', () => {
      const result = selectModel('hey', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "thanks"', () => {
      const result = selectModel('thanks', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "yes"', () => {
      const result = selectModel('yes', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "no"', () => {
      const result = selectModel('no', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "ok"', () => {
      const result = selectModel('ok', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "what can you do"', () => {
      const result = selectModel('what can you do', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should return Gemini Flash for "are you connected to Slack"', () => {
      const result = selectModel('are you connected to Slack', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple');
    });

    it('should NOT treat greeting as simple if message is >= 100 chars', () => {
      const longGreeting = 'hi ' + 'a'.repeat(98); // over 100 chars
      const result = selectModel(longGreeting, []);
      // Falls through simple check — ends up at default (gemini) since no services/keywords
      expect(result.modelId).toBe('gemini-2.5-flash');
      expect(result.tier).toBe('simple'); // default tier is also simple
    });
  });

  describe('complex messages with keywords', () => {
    it('should return Anthropic for "analyze" keyword when ANTHROPIC_API_KEY is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
      vi.stubEnv('OPENAI_API_KEY', '');

      const result = selectModel('Please analyze the data from last quarter', []);
      expect(result.provider).toBe('anthropic');
      expect(result.modelId).toBe('claude-sonnet-4-20250514');
      expect(result.tier).toBe('complex');
    });

    it('should return OpenAI for "compare" keyword when only OPENAI_API_KEY is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', 'test-key');

      const result = selectModel('Compare the performance of these two approaches', []);
      expect(result.provider).toBe('openai');
      expect(result.modelId).toBe('gpt-4o');
      expect(result.tier).toBe('complex');
    });

    it('should return Gemini Flash for "analyze" keyword when no API keys are set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      const result = selectModel('analyze this data', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
    });

    it('should return Anthropic for "across" keyword when ANTHROPIC_API_KEY is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const result = selectModel('Check data across all services', []);
      expect(result.provider).toBe('anthropic');
      expect(result.tier).toBe('complex');
    });

    it('should return Anthropic for "investigate" keyword when ANTHROPIC_API_KEY is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const result = selectModel('Investigate why the metrics dropped', []);
      expect(result.provider).toBe('anthropic');
      expect(result.tier).toBe('complex');
    });

    it('should return Anthropic for "plan" keyword when ANTHROPIC_API_KEY is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const result = selectModel('plan a migration strategy for our database', []);
      expect(result.provider).toBe('anthropic');
      expect(result.tier).toBe('complex');
    });

    it('should return complex tier for message longer than 500 chars', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const longMessage = 'Tell me something. '.repeat(30); // > 500 chars
      const result = selectModel(longMessage, []);
      expect(result.provider).toBe('anthropic');
      expect(result.tier).toBe('complex');
    });

    it('should fall back to Gemini for long message when no API keys', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      const longMessage = 'x'.repeat(501);
      const result = selectModel(longMessage, []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
    });
  });

  describe('messages mentioning connected services', () => {
    it('should escalate to complex tier (Anthropic) when 2+ services are mentioned', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const result = selectModel(
        'Pull data from GitHub and Slack',
        ['github', 'slack', 'notion']
      );
      expect(result.provider).toBe('anthropic');
      expect(result.tier).toBe('complex');
    });

    it('should use medium tier (OpenAI) when exactly 1 service is mentioned', () => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const result = selectModel('Show me the latest messages from slack', ['slack', 'github']);
      expect(result.provider).toBe('openai');
      expect(result.modelId).toBe('gpt-4o');
      expect(result.tier).toBe('medium');
    });

    it('should fall back to Gemini when 1 service is mentioned but no API keys', () => {
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const result = selectModel('Show me messages from slack', ['slack']);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
    });

    it('should prefer Anthropic over OpenAI for 2+ services when both keys are set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
      vi.stubEnv('OPENAI_API_KEY', 'test-key');

      const result = selectModel(
        'Fetch data from github and slack and compare',
        ['github', 'slack']
      );
      expect(result.provider).toBe('anthropic');
      expect(result.tier).toBe('complex');
    });

    it('should use OpenAI when 2+ services mentioned but no Anthropic key', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', 'test-key');

      const result = selectModel(
        'Combine data from github and notion',
        ['github', 'notion']
      );
      expect(result.provider).toBe('openai');
      expect(result.tier).toBe('complex');
    });

    it('should fall back to Gemini when 2+ services mentioned but no API keys', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      const result = selectModel(
        'Pull from github and slack',
        ['github', 'slack']
      );
      expect(result.provider).toBe('google');
    });

    it('service matching is case-insensitive', () => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      // 'Slack' in message, 'slack' in connected services
      const result = selectModel('Show me messages from Slack', ['slack', 'github']);
      expect(result.provider).toBe('openai');
      expect(result.tier).toBe('medium');
    });
  });

  describe('previousStepFailed option', () => {
    it('should escalate to Anthropic when previousStepFailed is true and ANTHROPIC_API_KEY is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const result = selectModel('hi', [], { previousStepFailed: true });
      expect(result.provider).toBe('anthropic');
      expect(result.modelId).toBe('claude-sonnet-4-20250514');
      expect(result.tier).toBe('complex');
    });

    it('should escalate to OpenAI when previousStepFailed is true and only OPENAI_API_KEY is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', 'test-key');

      const result = selectModel('hi', [], { previousStepFailed: true });
      expect(result.provider).toBe('openai');
      expect(result.modelId).toBe('gpt-4o');
      expect(result.tier).toBe('medium');
    });

    it('should continue with normal routing when previousStepFailed is true but no API keys', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      // Falls through to simple pattern match for 'hi'
      const result = selectModel('hi', [], { previousStepFailed: true });
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
    });

    it('should prefer Anthropic over OpenAI when previousStepFailed and both keys set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
      vi.stubEnv('OPENAI_API_KEY', 'test-key');

      const result = selectModel('hello', [], { previousStepFailed: true });
      expect(result.provider).toBe('anthropic');
    });
  });

  describe('forceProvider option', () => {
    it('should use Anthropic when forceProvider is "anthropic" and key is set', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const result = selectModel('hi', [], { forceProvider: 'anthropic' });
      expect(result.provider).toBe('anthropic');
      expect(result.modelId).toBe('claude-sonnet-4-20250514');
      expect(result.tier).toBe('complex');
    });

    it('should use OpenAI when forceProvider is "openai" and key is set', () => {
      vi.stubEnv('OPENAI_API_KEY', 'test-key');

      const result = selectModel('hi', [], { forceProvider: 'openai' });
      expect(result.provider).toBe('openai');
      expect(result.modelId).toBe('gpt-4o');
      expect(result.tier).toBe('medium');
    });

    it('should ignore forceProvider "anthropic" when no ANTHROPIC_API_KEY', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      // forceProvider anthropic but no key — falls through to normal routing
      const result = selectModel('hi', [], { forceProvider: 'anthropic' });
      // 'hi' matches simple pattern → Gemini
      expect(result.provider).toBe('google');
    });

    it('should ignore forceProvider "openai" when no OPENAI_API_KEY', () => {
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const result = selectModel('hi', [], { forceProvider: 'openai' });
      expect(result.provider).toBe('google');
    });

    it('forceProvider takes precedence over simple pattern match', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const result = selectModel('hello', [], { forceProvider: 'anthropic' });
      expect(result.provider).toBe('anthropic');
      // Would normally be 'simple' tier from greeting, but forceProvider overrides
      expect(result.tier).toBe('complex');
    });
  });

  describe('fallback when no API keys are set', () => {
    it('should return Gemini Flash for any non-trivial message when no keys', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      const result = selectModel('What are the latest sales figures?', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
    });

    it('should return Gemini Flash for complex keywords when no keys', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      const result = selectModel('Please summarize data from multiple sources and compare', []);
      expect(result.provider).toBe('google');
      expect(result.modelId).toBe('gemini-2.5-flash');
    });

    it('should always return a valid model selection even with empty message and no keys', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      const result = selectModel('', []);
      expect(result.model).toBeDefined();
      expect(result.modelId).toBeDefined();
      expect(result.provider).toBeDefined();
      expect(result.tier).toBeDefined();
    });
  });
});

describe('selectSchedulerModel', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should prefer OpenAI when OPENAI_API_KEY is set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const result = selectSchedulerModel();
    expect(result.provider).toBe('openai');
    expect(result.modelId).toBe('gpt-4o');
    expect(result.tier).toBe('medium');
  });

  it('should prefer OpenAI over Anthropic when both keys are set', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

    const result = selectSchedulerModel();
    expect(result.provider).toBe('openai');
    expect(result.modelId).toBe('gpt-4o');
    expect(result.tier).toBe('medium');
  });

  it('should fall back to Anthropic when only ANTHROPIC_API_KEY is set', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

    const result = selectSchedulerModel();
    expect(result.provider).toBe('anthropic');
    expect(result.modelId).toBe('claude-sonnet-4-20250514');
    expect(result.tier).toBe('medium');
  });

  it('should fall back to Gemini when no API keys are set', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const result = selectSchedulerModel();
    expect(result.provider).toBe('google');
    expect(result.modelId).toBe('gemini-2.5-flash');
    expect(result.tier).toBe('simple');
  });

  it('should always return a valid ModelSelection', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const result = selectSchedulerModel();
    expect(result.model).toBeDefined();
    expect(result.modelId).toBeDefined();
    expect(result.provider).toBeDefined();
    expect(result.tier).toBeDefined();
  });
});
