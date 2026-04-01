/**
 * Evaluation framework types.
 */

export interface EvalCase {
  id: string;
  name: string;
  description: string;
  /** The user message to send */
  input: string;
  /** Expected behavior criteria */
  expectations: {
    /** Tools that should be called */
    shouldUseTool?: string[];
    /** Tools that should NOT be called */
    shouldNotUseTool?: string[];
    /** Text patterns that should appear in the response */
    outputContains?: string[];
    /** Text patterns that should NOT appear in the response */
    outputNotContains?: string[];
    /** Maximum number of steps allowed */
    maxSteps?: number;
    /** Response should be non-empty */
    shouldRespond?: boolean;
    /** Custom validator function */
    customValidator?: (response: string, toolCalls: string[]) => boolean;
  };
  /** Optional: specific model to test with */
  model?: string;
  /** Tags for filtering */
  tags?: string[];
}

export interface EvalResult {
  caseId: string;
  caseName: string;
  passed: boolean;
  response: string;
  toolCalls: string[];
  steps: number;
  durationMs: number;
  tokenUsage: { prompt: number; completion: number; total: number };
  failures: string[];
}

export interface EvalSuiteResult {
  suiteName: string;
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  results: EvalResult[];
  durationMs: number;
}
