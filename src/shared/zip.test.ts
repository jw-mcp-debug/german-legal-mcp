import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { readFirstZipEntry } from './zip.js';

/**
 * Build an archive whose local header declares zeroed sizes and defers them to
 * a data descriptor (general-purpose bit 3). Producers that stream do this, and
 * a reader that trusts the local header returns an empty payload for it — the
 * exact failure this module parses the central directory to avoid.
 */
function zipWithStreamedEntry(name: string, contents: string): Buffer {
  const body = deflateRawSync(Buffer.from(contents, 'utf8'));
  const nameBytes = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(0x0008, 6);          // bit 3: sizes live in the descriptor
  local.writeUInt16LE(8, 8);               // deflate
  local.writeUInt32LE(0, 18);              // compressed size: unknown here
  local.writeUInt32LE(0, 22);              // uncompressed size: unknown here
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);

  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(body.length, 8);
  descriptor.writeUInt32LE(contents.length, 12);

  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(contents.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);             // local header offset
  nameBytes.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + body.length + descriptor.length, 16);

  return Buffer.concat([local, body, descriptor, central, eocd]);
}

describe('readFirstZipEntry', () => {
  it('reads a real RII decision archive', () => {
    const buffer = readFileSync(
      new URL('../providers/rii/adapters/fixtures/decision.zip', import.meta.url),
    );
    const entry = readFirstZipEntry(buffer);

    expect(entry.name).toBe('jb-KORE300012024.xml');
    expect(entry.data.length).toBe(58822);
    expect(entry.data.toString('utf8', 0, 5)).toBe('<?xml');
  });

  it('reads an entry whose sizes are deferred to a data descriptor', () => {
    const contents = 'Beschluss des Gerichtshofs. '.repeat(50);
    const entry = readFirstZipEntry(zipWithStreamedEntry('doc.xml', contents));

    expect(entry.name).toBe('doc.xml');
    expect(entry.data.toString('utf8')).toBe(contents);
  });

  it('rejects input that is not a ZIP rather than returning rubbish', () => {
    expect(() => readFirstZipEntry(Buffer.from('<html>not a zip</html>')))
      .toThrow(/end-of-central-directory/);
  });
});
