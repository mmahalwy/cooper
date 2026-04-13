import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export type ModelTier = 'simple' | 'medium' | 'complex';

export interface ModelSelection {
  model: LanguageModel;
  modelId: string;
  provider: string;
  tier: ModelTier;
}

const COMPLEX_KEYWORDS = /\b(plan|analyze|compare|report|across|investigate|audit|review|summarize.*from|combine.*data)\b/i;
const SIMPLE_PATTERNS = /^(hi|hello|hey|thanks|ok|yes|no|what can you|are you connected)\b/i;

export function selectModel(
  message: string,
  connectedServices: string[],
  options?: { previousStepFailed?: boolean; forceProvider?: string; forceModel?: string; orgModelPreference?: string }
): ModelSelection {
  // Lazy-load providers only when API keys are available
  const getAnthropic = () => {
    const { anthropic } = require('@ai-sdk/anthropic');
    return anthropic;
  };
  const getOpenAI = () => {
    const { openai } = require('@ai-sdk/openai');
    return openai;
  };

  switch (options?.forceModel) {
    case 'gemini-flash':
    case 'gemini-2.5-flash':
      return { model: google('gemini-2.5-flash'), modelId: 'gemini-2.5-flash', provider: 'google', tier: 'simple' };
    case 'gemini-pro':
    case 'gemini-2.5-pro':
      return { model: google('gemini-2.5-pro'), modelId: 'gemini-2.5-pro', provider: 'google', tier: 'complex' };
  }

  // If org has a model preference (and no explicit forceProvider override), treat it like forceProvider
  const effectiveProvider = options?.forceProvider ||
    (options?.orgModelPreference && options.orgModelPreference !== 'auto' ? options.orgModelPreference : undefined);

  // If a provider is forced
  if (effectiveProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return { model: getAnthropic()('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'complex' };
  }
  if (effectiveProvider === 'openai' && process.env.OPENAI_API_KEY) {
    return { model: getOpenAI()('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
  }
  if (effectiveProvider === 'gemini') {
    return { model: google('gemini-2.5-pro'), modelId: 'gemini-2.5-pro', provider: 'google', tier: 'complex' };
  }

  // Escalate if previous step failed
  if (options?.previousStepFailed) {
    if (process.env.ANTHROPIC_API_KEY) {
      return { model: getAnthropic()('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'complex' };
    }
    if (process.env.OPENAI_API_KEY) {
      return { model: getOpenAI()('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
    }
  }

  // Simple: greetings, yes/no, basic Q&A
  if (SIMPLE_PATTERNS.test(message.trim()) && message.length < 100) {
    return { model: google('gemini-2.5-flash'), modelId: 'gemini-2.5-flash', provider: 'google', tier: 'simple' };
  }

  // Complex: multi-service keywords, long messages referencing multiple services
  const mentionedServices = connectedServices.filter(s => message.toLowerCase().includes(s.toLowerCase()));
  const isComplex = COMPLEX_KEYWORDS.test(message) || mentionedServices.length >= 2 || message.length > 500;

  if (isComplex) {
    if (process.env.ANTHROPIC_API_KEY) {
      return { model: getAnthropic()('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'complex' };
    }
    if (process.env.OPENAI_API_KEY) {
      return { model: getOpenAI()('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'complex' };
    }
  }

  // Medium: anything that involves tool use with connected services
  if (mentionedServices.length >= 1) {
    if (process.env.OPENAI_API_KEY) {
      return { model: getOpenAI()('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
    }
  }

  // Default: Gemini Flash
  return { model: google('gemini-2.5-flash'), modelId: 'gemini-2.5-flash', provider: 'google', tier: 'simple' };
}

/** For scheduler executor — always use medium tier */
export function selectSchedulerModel(): ModelSelection {
  if (process.env.OPENAI_API_KEY) {
    const { openai } = require('@ai-sdk/openai');
    return { model: openai('gpt-4o'), modelId: 'gpt-4o', provider: 'openai', tier: 'medium' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { anthropic } = require('@ai-sdk/anthropic');
    return { model: anthropic('claude-sonnet-4-20250514'), modelId: 'claude-sonnet-4-20250514', provider: 'anthropic', tier: 'medium' };
  }
  return { model: google('gemini-2.5-flash'), modelId: 'gemini-2.5-flash', provider: 'google', tier: 'simple' };
}
