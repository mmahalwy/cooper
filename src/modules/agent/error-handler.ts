/**
 * Error handling utilities for the agent engine.
 * Provides retry logic, structured error logging, and graceful degradation.
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'rate_limit',
    'Rate limit',
    '429',
    '503',
    '502',
    'RESOURCE_EXHAUSTED',
    'socket hang up',
  ],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error: unknown, retryableErrors: string[]): boolean {
  const errorStr = String(error);
  return retryableErrors.some(re => errorStr.includes(re));
}

/**
 * Execute an async function with exponential backoff retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === opts.maxRetries || !isRetryable(error, opts.retryableErrors!)) {
        console.error(`[error-handler] ${label} failed permanently after ${attempt + 1} attempt(s):`, error);
        throw error;
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt),
        opts.maxDelayMs
      );
      console.warn(`[error-handler] ${label} failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${delay}ms:`, String(error).slice(0, 100));
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Wrap a tool's execute function with retry logic.
 */
export function wrapToolWithRetry(
  toolName: string,
  executeFn: (...args: any[]) => Promise<any>,
  options?: Partial<RetryOptions>
): (...args: any[]) => Promise<any> {
  return async (...args: any[]) => {
    return withRetry(
      () => executeFn(...args),
      `tool:${toolName}`,
      options
    );
  };
}

export interface StructuredError {
  type: 'tool_failure' | 'model_error' | 'timeout' | 'auth_error' | 'unknown';
  tool?: string;
  message: string;
  retryable: boolean;
  timestamp: string;
}

/**
 * Classify an error into a structured format.
 */
export function classifyError(error: unknown, context?: { tool?: string }): StructuredError {
  const msg = String(error);
  
  if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized')) {
    return {
      type: 'auth_error',
      tool: context?.tool,
      message: 'Authentication failed — the integration may need to be reconnected.',
      retryable: false,
      timestamp: new Date().toISOString(),
    };
  }

  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('deadline')) {
    return {
      type: 'timeout',
      tool: context?.tool,
      message: 'Request timed out — the service may be slow or unavailable.',
      retryable: true,
      timestamp: new Date().toISOString(),
    };
  }

  if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      type: 'tool_failure',
      tool: context?.tool,
      message: 'Rate limited — too many requests. Will retry automatically.',
      retryable: true,
      timestamp: new Date().toISOString(),
    };
  }

  if (context?.tool) {
    return {
      type: 'tool_failure',
      tool: context.tool,
      message: msg.slice(0, 200),
      retryable: isRetryable(error, DEFAULT_RETRY_OPTIONS.retryableErrors!),
      timestamp: new Date().toISOString(),
    };
  }

  return {
    type: 'unknown',
    message: msg.slice(0, 200),
    retryable: false,
    timestamp: new Date().toISOString(),
  };
}
