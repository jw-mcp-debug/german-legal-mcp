import { inflateRawSync } from 'node:zlib';

/**
 * Minimal reader for the single-entry archives the legal portals publish.
 *
 * RII distributes each decision as a ZIP holding one XML file, and GII does the
 * same for each law. Node has no ZIP reader, and pulling in a dependency to
 * open a one-file archive is a poor trade — `zlib` already provides the only
 * part that is hard.
 *
 * The central directory is parsed rather than the local file header, because
 * the local header is allowed to carry zeroed sizes and defer them to a data
 * descriptor after the payload (general-purpose bit 3). The central directory
 * is always authoritative, so reading it avoids a case that would otherwise
 * appear to work until the day a producer starts streaming.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
/** ZIP comments are 16-bit-length, so the record starts within this window. */
const EOCD_SEARCH_LIMIT = 0xffff + EOCD_MIN_SIZE;

export interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - EOCD_SEARCH_LIMIT);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= start; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error('Not a ZIP archive: no end-of-central-directory record.');
}

/**
 * Read the first entry of a ZIP archive.
 *
 * Only stored (0) and deflated (8) entries are supported, which is everything
 * these publishers emit; anything else fails loudly rather than returning
 * plausible rubbish.
 */
export function readFirstZipEntry(buffer: Buffer): ZipEntry {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  if (entryCount === 0) throw new Error('ZIP archive is empty.');

  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(centralOffset) !== CENTRAL_SIGNATURE) {
    throw new Error('Malformed ZIP: central directory signature missing.');
  }

  const method = buffer.readUInt16LE(centralOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralOffset + 20);
  const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
  const nameLength = buffer.readUInt16LE(centralOffset + 28);
  const localOffset = buffer.readUInt32LE(centralOffset + 42);
  const name = buffer.toString('utf8', centralOffset + 46, centralOffset + 46 + nameLength);

  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error(`Malformed ZIP: local header missing for "${name}".`);
  }
  // The local header's own name and extra lengths may differ from the central
  // directory's, so the payload offset has to come from the local record.
  const dataStart = localOffset + 30
    + buffer.readUInt16LE(localOffset + 26)
    + buffer.readUInt16LE(localOffset + 28);
  const payload = buffer.subarray(dataStart, dataStart + compressedSize);

  if (method === 0) return { name, data: Buffer.from(payload) };
  if (method !== 8) throw new Error(`Unsupported ZIP compression method ${method} for "${name}".`);

  const data = inflateRawSync(payload);
  if (uncompressedSize !== 0 && data.length !== uncompressedSize) {
    throw new Error(
      `ZIP entry "${name}" inflated to ${data.length} bytes, expected ${uncompressedSize}.`,
    );
  }
  return { name, data };
}
