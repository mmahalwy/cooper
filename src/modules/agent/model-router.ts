import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';

export interface ModelConfig {
  id: string;
  provider: 'google' | 'anthropic';
  modelName: string;
  displayName: string;
  strengths: string[];
  maxSteps: number;
  thinkingBudget?: number;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'gemini-flash',
    provider: 'google',
    modelName: 'gemini-2.5-flash-preview-05-20',
    displayName: 'Gemini Flash',
    strengths: ['speed', 'simple-questions', 'data-lookup', 'summarization'],
    maxSteps: 25,
    thinkingBudget: 1024,
  },
  {
    id: 'gemini-pro',
    provider: 'google',
    modelName: 'gemini-2.5-pro-preview-05-06',
    displayName: 'Gemini Pro',
    strengths: ['complex-reasoning', 'analysis', 'planning', 'multi-step'],
    maxSteps: 25,
    thinkingBudget: 4096,
  },
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    modelName: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet',
    strengths: ['code-generation', 'writing', 'detailed-analysis', 'instruction-following'],
    maxSteps: 25,
  },
];

const DEFAULT_MODEL_ID = 'gemini-flash';

export function selectModel(userMessage: string, modelOverride?: string): ModelConfig {
  if (modelOverride) {
    const override = AVAILABLE_MODELS.find(m => m.id === modelOverride);
    if (override) return override;
  }
  const msg = userMessage.toLowerCase();
  const codeSignals = ['write code', 'write a script', 'debug', 'fix this code', 'implement', 'refactor', 'pull request', 'function that', 'class that', 'regex', 'sql query', 'api endpoint'];
  if (codeSignals.some(s => msg.includes(s))) {
    const claude = AVAILABLE_MODELS.find(m => m.id === 'claude-sonnet');
    if (claude && process.env.ANTHROPIC_API_KEY) return claude;
  }
  const complexSignals = ['analyze', 'compare', 'strategy', 'plan', 'architecture', 'design', 'trade-off', 'tradeoff', 'pros and cons', 'deep dive', 'evaluate', 'review this', 'what should', 'complex'];
  if (complexSignals.some(s => msg.includes(s))) {
    return AVAILABLE_MODELS.find(m => m.id === 'gemini-pro')!;
  }
  return AVAILABLE_MODELS.find(m => m.id === DEFAULT_MODEL_ID)!;
}

export function getModelInstance(config: ModelConfig) {
  switch (config.provider) {
    case 'google': return google(config.modelName);
    case 'anthropic': return anthropic(config.modelName);
    default: return google(config.modelName);
  }
}
