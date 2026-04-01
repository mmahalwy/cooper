import { describe, it, expect } from 'vitest';
import { detectTechStack } from './repo-index';

describe('detectTechStack', () => {
  // ──────────────────────────────────────────────
  // Node.js / TypeScript+JavaScript projects
  // ──────────────────────────────────────────────

  it('detects Next.js from package.json', () => {
    const configs = {
      'package.json': JSON.stringify({
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
        scripts: { test: 'vitest' },
      }),
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('TypeScript/JavaScript');
    expect(stack.framework).toBe('Next.js');
    expect(stack.testCommand).toBe('vitest');
  });

  it('detects Express from package.json', () => {
    const configs = {
      'package.json': JSON.stringify({
        dependencies: { express: '^4.18.0' },
        scripts: { test: 'jest' },
      }),
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('TypeScript/JavaScript');
    expect(stack.framework).toBe('Express');
    expect(stack.testCommand).toBe('jest');
  });

  it('detects React (without Next.js) from package.json', () => {
    const configs = {
      'package.json': JSON.stringify({
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      }),
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('TypeScript/JavaScript');
    expect(stack.framework).toBe('React');
  });

  it('detects Vue from package.json', () => {
    const configs = {
      'package.json': JSON.stringify({
        dependencies: { vue: '^3.0.0' },
      }),
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('TypeScript/JavaScript');
    expect(stack.framework).toBe('Vue');
  });

  it('detects SvelteKit via @sveltejs/kit in devDependencies', () => {
    const configs = {
      'package.json': JSON.stringify({
        devDependencies: { '@sveltejs/kit': '^2.0.0', svelte: '^4.0.0' },
      }),
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('TypeScript/JavaScript');
    expect(stack.framework).toBe('SvelteKit');
  });

  it('sets framework to null when no recognised framework is present', () => {
    const configs = {
      'package.json': JSON.stringify({
        dependencies: { lodash: '^4.0.0' },
      }),
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('TypeScript/JavaScript');
    expect(stack.framework).toBeNull();
  });

  // ──────────────────────────────────────────────
  // Test command detection from package.json
  // ──────────────────────────────────────────────

  it('picks up test command from package.json scripts', () => {
    const configs = {
      'package.json': JSON.stringify({
        dependencies: {},
        scripts: { test: 'vitest run' },
      }),
    };
    const stack = detectTechStack(configs);
    expect(stack.testCommand).toBe('vitest run');
  });

  it('sets testCommand to null when scripts.test is absent', () => {
    const configs = {
      'package.json': JSON.stringify({ dependencies: {} }),
    };
    const stack = detectTechStack(configs);
    expect(stack.testCommand).toBeNull();
  });

  // ──────────────────────────────────────────────
  // Package manager detection
  // ──────────────────────────────────────────────

  it('detects pnpm when pnpm-lock.yaml is present', () => {
    const configs = {
      'package.json': JSON.stringify({ dependencies: {} }),
      'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
    };
    const stack = detectTechStack(configs);
    expect(stack.packageManager).toBe('pnpm');
  });

  it('detects yarn when yarn.lock is present (and no pnpm-lock.yaml)', () => {
    const configs = {
      'package.json': JSON.stringify({ dependencies: {} }),
      'yarn.lock': '# yarn lockfile v1\n',
    };
    const stack = detectTechStack(configs);
    expect(stack.packageManager).toBe('yarn');
  });

  it('falls back to npm when neither pnpm-lock.yaml nor yarn.lock is present', () => {
    const configs = {
      'package.json': JSON.stringify({ dependencies: {} }),
    };
    const stack = detectTechStack(configs);
    expect(stack.packageManager).toBe('npm');
  });

  // ──────────────────────────────────────────────
  // Python projects
  // ──────────────────────────────────────────────

  it('detects Django from pyproject.toml', () => {
    const configs = {
      'pyproject.toml': '[tool.poetry]\nname = "myapp"\n\n[tool.poetry.dependencies]\ndjango = "^4.2"',
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('Python');
    expect(stack.framework).toBe('Django');
    expect(stack.testCommand).toBe('pytest');
    expect(stack.packageManager).toBe('poetry');
  });

  it('detects FastAPI from pyproject.toml', () => {
    const configs = {
      'pyproject.toml': '[build-system]\nrequires = ["setuptools"]\n\n[project]\ndependencies = ["fastapi"]',
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('Python');
    expect(stack.framework).toBe('FastAPI');
    expect(stack.testCommand).toBe('pytest');
    expect(stack.packageManager).toBe('pip');
  });

  it('detects Flask from pyproject.toml', () => {
    const configs = {
      'pyproject.toml': '[project]\ndependencies = ["flask>=3.0"]',
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('Python');
    expect(stack.framework).toBe('Flask');
  });

  it('detects poetry as package manager when [tool.poetry] section is present', () => {
    const configs = {
      'pyproject.toml': '[tool.poetry]\nname = "app"\n',
    };
    const stack = detectTechStack(configs);
    expect(stack.packageManager).toBe('poetry');
  });

  it('falls back to pip when [tool.poetry] section is absent', () => {
    const configs = {
      'pyproject.toml': '[project]\nname = "app"\n',
    };
    const stack = detectTechStack(configs);
    expect(stack.packageManager).toBe('pip');
  });

  // ──────────────────────────────────────────────
  // Rust projects
  // ──────────────────────────────────────────────

  it('detects Rust from Cargo.toml', () => {
    const configs = {
      'Cargo.toml': '[package]\nname = "my-crate"\nversion = "0.1.0"\n',
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('Rust');
    expect(stack.testCommand).toBe('cargo test');
    expect(stack.packageManager).toBe('cargo');
    expect(stack.framework).toBeNull();
  });

  // ──────────────────────────────────────────────
  // Go projects
  // ──────────────────────────────────────────────

  it('detects Go from go.mod', () => {
    const configs = {
      'go.mod': 'module github.com/example/myapp\n\ngo 1.22\n',
    };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('Go');
    expect(stack.testCommand).toBe('go test ./...');
    expect(stack.packageManager).toBe('go modules');
    expect(stack.framework).toBeNull();
  });

  // ──────────────────────────────────────────────
  // Empty / unknown configs
  // ──────────────────────────────────────────────

  it('returns unknown language for empty configs', () => {
    const stack = detectTechStack({});
    expect(stack.language).toBe('unknown');
    expect(stack.framework).toBeNull();
    expect(stack.testCommand).toBeNull();
    expect(stack.packageManager).toBeNull();
  });

  it('returns unknown for unrecognised config files', () => {
    const configs = { 'Makefile': 'build:\n\tgcc main.c -o app\n' };
    const stack = detectTechStack(configs);
    expect(stack.language).toBe('unknown');
  });

  it('handles malformed package.json without throwing', () => {
    const configs = { 'package.json': 'not valid json {{' };
    const stack = detectTechStack(configs);
    // Falls through the catch block; language stays unknown
    expect(stack.language).toBe('unknown');
  });
});
