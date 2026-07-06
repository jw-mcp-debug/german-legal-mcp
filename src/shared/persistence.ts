import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface AtomicWriteOptions {
  fileMode?: number;
  directoryMode?: number;
  serialize?: boolean;
}

export interface ReadJsonOptions<T> {
  validate?: (value: unknown) => value is T;
  quarantineCorrupt?: boolean;
}

export class InvalidPersistedDataError extends Error {
  constructor(
    readonly path: string,
    readonly quarantinedPath?: string,
    options?: ErrorOptions,
  ) {
    super(`Invalid persisted JSON: ${path}`, options);
    this.name = 'InvalidPersistedDataError';
  }
}

const writeQueues = new Map<string, Promise<void>>();

async function writeAtomic(
  path: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions,
): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(directory, {
    recursive: true,
    mode: options.directoryMode,
  });
  if (options.directoryMode !== undefined) {
    await chmod(directory, options.directoryMode);
  }

  try {
    await writeFile(temporaryPath, data, {
      mode: options.fileMode,
    });
    await rename(temporaryPath, path);
    if (options.fileMode !== undefined) {
      await chmod(path, options.fileMode);
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function atomicWriteFile(
  path: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  if (!options.serialize) {
    await writeAtomic(path, data, options);
    return;
  }

  const previous = writeQueues.get(path) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => writeAtomic(path, data, options));
  writeQueues.set(path, current);

  try {
    await current;
  } finally {
    if (writeQueues.get(path) === current) {
      writeQueues.delete(path);
    }
  }
}

export async function atomicWriteJson(
  path: string,
  value: unknown,
  options: AtomicWriteOptions = {},
): Promise<void> {
  await atomicWriteFile(path, JSON.stringify(value), options);
}

export async function readJsonFile<T>(
  path: string,
  options: ReadJsonOptions<T> = {},
): Promise<T> {
  try {
    const value = JSON.parse(await readFile(path, 'utf-8')) as unknown;
    if (options.validate && !options.validate(value)) {
      throw new TypeError('Persisted JSON failed validation');
    }
    return value as T;
  } catch (error) {
    let quarantinedPath: string | undefined;
    const invalidData = error instanceof SyntaxError || (
      error instanceof TypeError
      && error.message === 'Persisted JSON failed validation'
    );
    if (options.quarantineCorrupt && invalidData) {
      quarantinedPath = `${path}.corrupt.${Date.now()}.${randomUUID()}`;
      await rename(path, quarantinedPath).catch(() => {
        quarantinedPath = undefined;
      });
    }
    if (invalidData) {
      throw new InvalidPersistedDataError(path, quarantinedPath, { cause: error });
    }
    throw error;
  }
}
