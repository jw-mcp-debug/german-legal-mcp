import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { HTTP_USER_AGENT } from '../../config.js';
import { rootLogger } from '../../shared/logger.js';
import { atomicWriteJson } from '../../shared/persistence.js';
import { cachePath } from '../../shared/state-paths.js';
import {
  parseDocument,
  parseIssuerList,
  parseSearchResults,
  parseTeilliste,
} from './parser.js';
import type { VwvDocument, VwvIndexEntry, VwvSearchPage } from './parser.js';

const logger = rootLogger.child({ module: 'vwv-client' });

export const BASE_URL = 'https://www.verwaltungsvorschriften-im-internet.de';

/** Title search and full-text search are separate ht://Dig configurations. */
const SEARCH_CONFIG = {
  title: 'Titel_vwvbund',
  fulltext: 'Gesamt_vwvbund',
} as const;

export type VwvSearchMode = keyof typeof SEARCH_CONFIG;

const DEFAULT_INDEX_PATH = join(cachePath('vwv'), 'title-index.json');

/**
 * How long the title index stays usable.
 *
 * Administrative regulations change on the scale of years, and rebuilding costs
 * one request per ministry. A month is short enough that a new regulation
 * appears without anyone intervening, and long enough that the rebuild is rare.
 */
const INDEX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedIndex {
  readonly builtAt: number;
  readonly entries: readonly VwvIndexEntry[];
}

function isCachedIndex(value: unknown): value is CachedIndex {
  return typeof value === 'object' && value !== null
    && Array.isArray((value as CachedIndex).entries);
}

export class VwvClient {
  private index: readonly VwvIndexEntry[] | null = null;
  private building: Promise<readonly VwvIndexEntry[]> | null = null;

  constructor(
    private readonly http: Pick<AxiosInstance, 'get' | 'post'> = axios,
    /** Overridable so a test does not share one cache file with the next. */
    private readonly indexPath: string = DEFAULT_INDEX_PATH,
  ) {}

  /**
   * The portal serves latin1 and says so; decoding as UTF-8 turns every umlaut
   * in a ministry's name into a replacement character, which then fails to
   * match anything a caller types.
   */
  private async fetchText(url: string): Promise<string> {
    const response = await this.http.get(url, {
      headers: { 'User-Agent': HTTP_USER_AGENT },
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data as ArrayBuffer).toString('latin1');
  }

  async search(query: string, mode: VwvSearchMode = 'fulltext'): Promise<VwvSearchPage> {
    const body = new URLSearchParams({
      config: SEARCH_CONFIG[mode],
      method: 'and',
      words: query,
    });
    logger.info('Searching administrative regulations', { query, mode });
    const response = await this.http.post(`${BASE_URL}/cgi-bin/htsearch`, body.toString(), {
      headers: {
        'User-Agent': HTTP_USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      responseType: 'arraybuffer',
    });
    return parseSearchResults(
      Buffer.from(response.data as ArrayBuffer).toString('latin1'),
    );
  }

  async getDocument(docId: string): Promise<VwvDocument> {
    const html = await this.fetchText(`${BASE_URL}/${docId}.htm`);
    return parseDocument(html, docId);
  }

  documentUrl(docId: string): string {
    return `${BASE_URL}/${docId}.htm`;
  }

  /**
   * Titles for every main regulation, built by walking the per-ministry
   * listings once and kept on disk afterwards.
   *
   * Built lazily and at most once concurrently: the first call pays roughly
   * twenty requests, and a second caller arriving mid-build waits for the same
   * promise rather than starting its own walk.
   */
  async getTitleIndex(): Promise<readonly VwvIndexEntry[]> {
    if (this.index) return this.index;
    this.building ??= this.loadOrBuildIndex().finally(() => { this.building = null; });
    this.index = await this.building;
    return this.index;
  }

  /** Title for one document id, where the listings know it. */
  async titleOf(docId: string): Promise<string | undefined> {
    const index = await this.getTitleIndex().catch(() => []);
    return index.find((entry) => entry.docId === docId)?.title;
  }

  private async loadOrBuildIndex(): Promise<readonly VwvIndexEntry[]> {
    const cached = await this.readCachedIndex();
    if (cached) return cached;

    const issuers = parseIssuerList(await this.fetchText(`${BASE_URL}/erlassstellen.html`));
    logger.info('Building administrative-regulation title index', { issuers: issuers.length });

    const entries: VwvIndexEntry[] = [];
    for (const issuer of issuers) {
      try {
        const html = await this.fetchText(`${BASE_URL}/${issuer.path}`);
        entries.push(...parseTeilliste(html, issuer.name));
      } catch (error) {
        // One unreachable ministry costs its own regulations, not the index.
        logger.warn('Skipping issuer listing', { issuer: issuer.name, error });
      }
    }

    await atomicWriteJson(this.indexPath, { builtAt: Date.now(), entries }, { serialize: true })
      .catch((error: unknown) => logger.warn('Could not persist title index', { error }));
    logger.info('Title index built', { entries: entries.length });
    return entries;
  }

  private async readCachedIndex(): Promise<readonly VwvIndexEntry[] | null> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.indexPath, 'utf-8'));
      if (!isCachedIndex(raw)) return null;
      if (Date.now() - raw.builtAt > INDEX_TTL_MS) return null;
      return raw.entries;
    } catch {
      return null;
    }
  }
}
