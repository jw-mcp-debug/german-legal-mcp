import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveToFile } from './save-to-file.js';

describe('saveToFile', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('writes content to an absolute path and creates parent directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'save-to-file-'));
    directories.push(dir);
    const path = join(dir, 'nested', 'document.md');

    const result = await saveToFile(path, '# Document');

    expect(result.content[0]?.text).toContain(`Saved to ${path}`);
    expect(await readFile(path, 'utf-8')).toBe('# Document');
  });

  it('rejects relative paths with an actionable error', async () => {
    await expect(saveToFile('research/document.md', '# Document')).rejects.toThrow(
      'save_path must be an absolute path',
    );
  });
});
