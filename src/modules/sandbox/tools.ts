import { tool } from 'ai';
import { z } from 'zod';
import type { SandboxProvider } from './types';
import { E2BSandboxProvider } from './e2b';

let _sandboxInstance: SandboxProvider | null = null;

function getSandbox(): SandboxProvider {
  if (!_sandboxInstance) {
    if (!process.env.E2B_API_KEY) throw new Error('E2B_API_KEY not set');
    _sandboxInstance = new E2BSandboxProvider();
  }
  return _sandboxInstance;
}

export function createSandboxTools() {
  if (!process.env.E2B_API_KEY) return {};

  return {
    execute_code: tool({
      description: `Execute code in a secure sandbox. Use for data processing, calculations, charts, complex logic, math, statistics, and analysis. Python (with pandas, numpy, matplotlib) and JavaScript available. Write complete, runnable scripts. Print results to stdout.`,
      inputSchema: z.object({
        code: z.string().describe('The code to execute'),
        language: z.enum(['python', 'javascript', 'bash']).describe('Programming language'),
      }),
      execute: async ({ code, language }) => {
        try {
          const result = await getSandbox().execute(code, language);
          if (result.exitCode !== 0) return { success: false, error: result.stderr || result.error, stdout: result.stdout };
          return { success: true, output: result.stdout, stderr: result.stderr || undefined };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
    install_packages: tool({
      description: 'Install Python packages in the sandbox before running code that needs them.',
      inputSchema: z.object({
        packages: z.array(z.string()).describe('Package names to install, e.g., ["pandas", "scikit-learn"]'),
      }),
      execute: async ({ packages }) => {
        try {
          await getSandbox().installPackages?.(packages);
          return { installed: true, packages };
        } catch (error) {
          return { installed: false, error: String(error) };
        }
      },
    }),
  };
}
