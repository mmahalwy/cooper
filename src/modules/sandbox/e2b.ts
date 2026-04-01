import type { SandboxProvider, SandboxResult, SandboxConfig } from './types';
import { DEFAULT_SANDBOX_CONFIG } from './types';

export class E2BSandboxProvider implements SandboxProvider {
  private config: SandboxConfig;
  private sandbox: any = null;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  }

  private async getSandbox() {
    if (this.sandbox) return this.sandbox;
    try {
      const { Sandbox } = await import('@e2b/code-interpreter');
      this.sandbox = await Sandbox.create({ timeoutMs: this.config.timeout });
      return this.sandbox;
    } catch (error) {
      throw new Error(`E2B sandbox unavailable. Install @e2b/code-interpreter and set E2B_API_KEY. Error: ${error}`);
    }
  }

  async execute(code: string, language: 'python' | 'javascript' | 'bash'): Promise<SandboxResult> {
    const sandbox = await this.getSandbox();
    try {
      let result: any;
      if (language === 'python' || language === 'javascript') {
        result = await sandbox.runCode(code, { language });
      } else {
        result = await sandbox.process.start({ cmd: code });
        await result.wait();
      }
      return {
        stdout: (result.logs?.stdout || result.stdout || '').slice(0, this.config.maxOutputSize),
        stderr: (result.logs?.stderr || result.stderr || '').slice(0, this.config.maxOutputSize),
        exitCode: result.exitCode ?? 0,
        error: result.error ? String(result.error) : undefined,
      };
    } catch (error) {
      return { stdout: '', stderr: String(error), exitCode: 1, error: String(error) };
    }
  }

  async installPackages(packages: string[]): Promise<void> {
    const sandbox = await this.getSandbox();
    await sandbox.process.start({ cmd: `pip install ${packages.join(' ')}` });
  }

  async cleanup(): Promise<void> {
    if (this.sandbox) {
      try { await this.sandbox.kill(); } catch {}
      this.sandbox = null;
    }
  }
}
