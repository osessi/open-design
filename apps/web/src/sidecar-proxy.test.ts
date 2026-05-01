import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDaemonProxyTarget, resolveStandaloneServerEntry } from '../sidecar/server';

describe('resolveDaemonProxyTarget', () => {
  it('proxies allowlisted relative paths to the daemon origin', () => {
    const target = resolveDaemonProxyTarget('http://127.0.0.1:7456', '/api/projects?limit=10');

    expect(target?.href).toBe('http://127.0.0.1:7456/api/projects?limit=10');
  });

  it('does not let absolute request URLs replace the daemon origin', () => {
    const target = resolveDaemonProxyTarget(
      'http://127.0.0.1:7456',
      'http://169.254.169.254/api/latest/meta-data?token=1',
    );

    expect(target?.href).toBe('http://127.0.0.1:7456/api/latest/meta-data?token=1');
  });

  it('rejects non-daemon paths', () => {
    expect(resolveDaemonProxyTarget('http://127.0.0.1:7456', '/settings')).toBeNull();
  });
});

describe('resolveStandaloneServerEntry', () => {
  it('resolves the traced monorepo standalone server entry', async () => {
    const previousDistDir = process.env.OD_WEB_DIST_DIR;
    delete process.env.OD_WEB_DIST_DIR;
    const webRoot = await mkdtemp(join(tmpdir(), 'open-design-web-standalone-'));
    const nestedRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');
    const fallbackRoot = join(webRoot, '.next', 'standalone');

    try {
      await mkdir(nestedRoot, { recursive: true });
      await mkdir(fallbackRoot, { recursive: true });
      await writeFile(join(nestedRoot, 'server.js'), '', 'utf8');
      await writeFile(join(fallbackRoot, 'server.js'), '', 'utf8');

      expect(resolveStandaloneServerEntry(webRoot)).toBe(join(nestedRoot, 'server.js'));
    } finally {
      if (previousDistDir == null) {
        delete process.env.OD_WEB_DIST_DIR;
      } else {
        process.env.OD_WEB_DIST_DIR = previousDistDir;
      }
      await rm(webRoot, { force: true, recursive: true });
    }
  });

  it('prefers a copied standalone resource root before package fallback entries', async () => {
    const previousDistDir = process.env.OD_WEB_DIST_DIR;
    delete process.env.OD_WEB_DIST_DIR;
    const webRoot = await mkdtemp(join(tmpdir(), 'open-design-web-package-'));
    const copiedRoot = await mkdtemp(join(tmpdir(), 'open-design-web-copied-'));
    const copiedWebRoot = join(copiedRoot, 'apps', 'web');
    const packageFallbackRoot = join(webRoot, '.next', 'standalone', 'apps', 'web');

    try {
      await mkdir(copiedWebRoot, { recursive: true });
      await mkdir(packageFallbackRoot, { recursive: true });
      await writeFile(join(copiedWebRoot, 'server.js'), '', 'utf8');
      await writeFile(join(packageFallbackRoot, 'server.js'), '', 'utf8');

      expect(resolveStandaloneServerEntry(webRoot, copiedRoot)).toBe(join(copiedWebRoot, 'server.js'));
    } finally {
      if (previousDistDir == null) {
        delete process.env.OD_WEB_DIST_DIR;
      } else {
        process.env.OD_WEB_DIST_DIR = previousDistDir;
      }
      await rm(webRoot, { force: true, recursive: true });
      await rm(copiedRoot, { force: true, recursive: true });
    }
  });
});
