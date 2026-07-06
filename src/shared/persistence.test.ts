import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  atomicWriteFile,
  atomicWriteJson,
  InvalidPersistedDataError,
  readJsonFile,
} from './persistence.js';

describe('atomic persistence', () => {
  it('writes and replaces JSON without leaving temporary files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'glmcp-persistence-'));
    const path = join(dir, 'nested', 'state.json');

    await atomicWriteJson(path, { version: 1 });
    await atomicWriteJson(path, { version: 2 });

    await expect(readJsonFile(path)).resolves.toEqual({ version: 2 });
  });

  it('applies restrictive file permissions when requested', async () => {
    if (process.platform === 'win32') return;
    const dir = await mkdtemp(join(tmpdir(), 'glmcp-persistence-'));
    const path = join(dir, 'session.json');

    await atomicWriteFile(path, 'secret', {
      directoryMode: 0o700,
      fileMode: 0o600,
    });

    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect(await readFile(path, 'utf-8')).toBe('secret');
  });

  it('serializes writes to the same target in invocation order', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'glmcp-persistence-'));
    const path = join(dir, 'state.json');

    await Promise.all([
      atomicWriteJson(path, { version: 1 }, { serialize: true }),
      atomicWriteJson(path, { version: 2 }, { serialize: true }),
      atomicWriteJson(path, { version: 3 }, { serialize: true }),
    ]);

    await expect(readJsonFile(path)).resolves.toEqual({ version: 3 });
  });

  it('validates persisted JSON and quarantines invalid data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'glmcp-persistence-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify({ version: 1 }), 'utf-8');

    await expect(readJsonFile<{ version: 2 }>(path, {
      validate: (value): value is { version: 2 } => (
        typeof value === 'object'
        && value !== null
        && (value as { version?: unknown }).version === 2
      ),
      quarantineCorrupt: true,
    })).rejects.toBeInstanceOf(InvalidPersistedDataError);

    expect((await readdir(dir)).some((name) => name.startsWith('session.json.corrupt.')))
      .toBe(true);
  });
});
