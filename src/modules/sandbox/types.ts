/**
 * Sandbox types — shared interfaces for code execution providers.
 */

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
}

export interface SandboxSession {
  /** Execute code in the sandbox */
  execute(code: string, language: 'python' | 'javascript' | 'bash'): Promise<SandboxResult>;
  /** Install packages (pip for Python, npm for JS) */
  installPackages(packages: string[]): Promise<SandboxResult>;
  /** Write a file to the sandbox filesystem */
  writeFile(path: string, content: string): Promise<void>;
  /** Read a file from the sandbox filesystem */
  readFile(path: string): Promise<string>;
  /** Tear down the sandbox */
  close(): Promise<void>;
}

export interface SandboxConfig {
  /** E2B sandbox timeout in ms (default: 5 min) */
  timeoutMs: number;
  /** Max characters returned in stdout/stderr (default: 50 000) */
  maxOutputChars: number;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  timeoutMs: 5 * 60 * 1000,
  maxOutputChars: 50_000,
};
