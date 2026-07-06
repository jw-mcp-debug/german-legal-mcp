import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ToolResult } from './types.js';

/**
 * Save content to a file and return a metadata-only ToolResult.
 * Shared helper for the `save_path` pattern used across all providers.
 *
 * @param savePath - Destination file path
 * @param content - Content to write
 * @param meta - Additional metadata lines to include in the response
 */
export async function saveToFile(savePath: string, content: string, meta?: string): Promise<ToolResult> {
  await mkdir(dirname(savePath), { recursive: true });
  await writeFile(savePath, content, 'utf-8');
  const msg = `Saved to ${savePath} (${content.length} chars)${meta ? `\n\n${meta}` : ''}`;
  return { content: [{ type: 'text', text: msg }] };
}
