export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  files?: Array<{ name: string; url: string }>;
  error?: string;
}

export interface SandboxProvider {
  execute(code: string, language: 'python' | 'javascript' | 'bash'): Promise<SandboxResult>;
  installPackages?(packages: string[]): Promise<void>;
  cleanup?(): Promise<void>;
}

export interface SandboxConfig {
  provider: 'e2b' | 'local';
  timeout: number;
  maxOutputSize: number;
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  provider: 'e2b',
  timeout: 30_000,
  maxOutputSize: 10_000,
};
