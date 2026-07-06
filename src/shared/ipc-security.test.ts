import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertSecureIpcDir, isSecureOwnedDir } from './ipc-security.js';

describe('isSecureOwnedDir', () => {
  const self = 1000;

  it('accepts an owner-only directory owned by us', () => {
    expect(isSecureOwnedDir({ uid: self, mode: 0o700 }, self)).toBe(true);
  });

  it('rejects a directory owned by another user', () => {
    expect(isSecureOwnedDir({ uid: 0, mode: 0o700 }, self)).toBe(false);
  });

  it('rejects group- or world-accessible permission bits', () => {
    expect(isSecureOwnedDir({ uid: self, mode: 0o750 }, self)).toBe(false);
    expect(isSecureOwnedDir({ uid: self, mode: 0o755 }, self)).toBe(false);
    expect(isSecureOwnedDir({ uid: self, mode: 0o707 }, self)).toBe(false);
  });
});

describe('assertSecureIpcDir', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ipc-sec-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  const posix = process.platform !== 'win32' && process.getuid !== undefined;

  it.runIf(posix)('passes for an owner-only directory (self-healing the mode)', async () => {
    await chmod(dir, 0o755); // looser than required
    // Self-heals to 0700 and then passes.
    await expect(assertSecureIpcDir(dir)).resolves.toBeUndefined();
  });

  it.skipIf(posix)('is a no-op on non-POSIX platforms', async () => {
    await expect(assertSecureIpcDir(dir)).resolves.toBeUndefined();
  });
});
