import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';

const { mockGetRegistry } = vi.hoisted(() => ({
  mockGetRegistry: vi.fn(() => new Map([
    ['github/issues', { site: 'github', name: 'issues' }],
  ])),
}));

vi.mock('./registry.js', () => ({
  getRegistry: mockGetRegistry,
}));

// Mocks for node:fs
const mockExistsSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: (p: any) => mockExistsSync(p),
  readdirSync: (p: any, options?: any) => mockReaddirSync(p, options),
  readFileSync: (p: any, options?: any) => mockReadFileSync(p, options),
}));

import { getCompletions } from './completion.js';
import { getCompletionsFromManifest } from './completion-fast.js';

describe('getCompletions', () => {
  it('includes top-level built-ins that are registered outside the site registry', () => {
    const completions = getCompletions([], 1);

    expect(completions).toContain('plugin');
    expect(completions).toContain('external');
    expect(completions).not.toContain('install');
    expect(completions).not.toContain('register');
    expect(completions).not.toContain('setup');
  });

  it('still includes discovered site names', () => {
    const completions = getCompletions([], 1);

    expect(completions).toContain('github');
  });
});

describe('getCompletionsFromManifest', () => {
  it('includes builtins, sites from manifests, and dynamic plugins', () => {
    const pluginsDir = path.join(os.homedir(), '.opencli', 'plugins');

    mockExistsSync.mockImplementation((p: any) => {
      if (typeof p === 'string' && (p.includes('.opencli/plugins') || p.includes('cli-manifest.json') || p.includes('opencli-plugin.json'))) {
        return true;
      }
      return false;
    });

    mockReaddirSync.mockImplementation((p: any, options?: any) => {
      if (typeof p === 'string' && p.includes('.opencli/plugins') && !p.includes('opencli-plugin-custom')) {
        if (options && options.withFileTypes) {
          return [
            { name: 'opencli-plugin-custom', isDirectory: () => true, isSymbolicLink: () => false }
          ] as any;
        }
        return ['opencli-plugin-custom'] as any;
      }
      if (typeof p === 'string' && p.includes('opencli-plugin-custom')) {
        return ['custom-site-my-cmd.js', 'other-file.txt', 'ignored-test.test.ts'] as any;
      }
      return [] as any;
    });

    mockReadFileSync.mockImplementation((p: any) => {
      if (typeof p === 'string' && p.includes('cli-manifest.json')) {
        return JSON.stringify([
          { site: 'builtin-site', name: 'builtin-cmd' }
        ]);
      }
      if (typeof p === 'string' && p.includes('opencli-plugin.json')) {
        return JSON.stringify({ name: 'custom-site' });
      }
      return '';
    });

    // Test cursor <= 1 (site names)
    const siteCompletions = getCompletionsFromManifest([], 1, ['/dummy/cli-manifest.json']);
    expect(siteCompletions).toContain('builtin-site');
    expect(siteCompletions).toContain('custom-site');
    expect(siteCompletions).not.toContain('opencli-plugin-custom');
    expect(siteCompletions).toContain('plugin');

    // Test cursor === 2 (commands for site)
    const commandCompletions = getCompletionsFromManifest(['custom-site'], 2, ['/dummy/cli-manifest.json']);
    expect(commandCompletions).toContain('my-cmd');
    expect(commandCompletions).not.toContain('custom-site-my-cmd');
    expect(commandCompletions).not.toContain('other-file');
    expect(commandCompletions).not.toContain('ignored-test');
  });
});
