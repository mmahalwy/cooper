/**
 * E2B sandbox session — wraps @e2b/code-interpreter to implement SandboxSession.
 */

import type { SandboxSession, SandboxResult, SandboxConfig } from './types';
import { DEFAULT_SANDBOX_CONFIG } from './types';

export class E2BSession implements SandboxSession {
  private config: SandboxConfig;
  private sandbox: any = null;
  private ready: Promise<void>;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_SANDBOX_CONFIG, ...config };
    // Eagerly start creating the sandbox
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const { Sandbox } = await import('@e2b/code-interpreter');
    this.sandbox = await Sandbox.create({ timeoutMs: this.config.timeoutMs });
  }

  private async getSandbox() {
    await this.ready;
    if (!this.sandbox) throw new Error('Sandbox failed to initialize');
    return this.sandbox;
  }

  private truncate(s: string): string {
    if (s.length <= this.config.maxOutputChars) return s;
    return s.slice(0, this.config.maxOutputChars) + `\n... (truncated, ${s.length} chars total)`;
  }

  async execute(code: string, language: 'python' | 'javascript' | 'bash'): Promise<SandboxResult> {
    const sbx = await this.getSandbox();
    try {
      if (language === 'bash') {
        const proc = await sbx.commands.run(code);
        return {
          stdout: this.truncate(proc.stdout || ''),
          stderr: this.truncate(proc.stderr || ''),
          exitCode: proc.exitCode ?? 0,
        };
      }
      // python or javascript — use the code interpreter kernel
      const result = await sbx.runCode(code, { language });
      return {
        stdout: this.truncate(result.logs?.stdout?.join('\n') ?? ''),
        stderr: this.truncate(result.logs?.stderr?.join('\n') ?? ''),
        exitCode: result.error ? 1 : 0,
        error: result.error ? `${result.error.name}: ${result.error.value}\n${result.error.traceback}` : undefined,
      };
    } catch (err) {
      return { stdout: '', stderr: String(err), exitCode: 1, error: String(err) };
    }
  }

  async installPackages(packages: string[]): Promise<SandboxResult> {
    const sbx = await this.getSandbox();
    const cmd = `pip install -q ${packages.map((p) => `"${p}"`).join(' ')}`;
    const proc = await sbx.commands.run(cmd);
    return {
      stdout: this.truncate(proc.stdout || ''),
      stderr: this.truncate(proc.stderr || ''),
      exitCode: proc.exitCode ?? 0,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    const sbx = await this.getSandbox();
    await sbx.files.write(path, content);
  }

  async readFile(path: string): Promise<string> {
    const sbx = await this.getSandbox();
    const content = await sbx.files.read(path);
    return content;
  }

  async close(): Promise<void> {
    if (this.sandbox) {
      try { await this.sandbox.kill(); } catch { /* already dead */ }
      this.sandbox = null;
    }
  }
}
