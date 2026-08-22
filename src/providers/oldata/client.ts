import axios from 'axios';
import type { AxiosInstance } from 'axios';
import TurndownService from 'turndown';
import { HTTP_USER_AGENT } from '../../config.js';
import { rootLogger } from '../../shared/logger.js';

const logger = rootLogger.child({ module: 'oldata-client' });

export const BASE_URL = 'https://de.openlegaldata.io/api';

/**
 * The count the search endpoint reports stops here.
 *
 * A query broad enough to reach it is told "10.000", not the true figure, and
 * reporting that as a total would overstate what the source actually said. The
 * provider labels it as a floor instead.
 */
export const COUNT_CAP = 10_000;

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export interface OldataHit {
  readonly id: string;
  readonly court: string;
  readonly date: string;
  readonly slug: string;
  readonly jurisdiction?: string;
  readonly levelOfAppeal?: string;
  readonly decisionType?: string;
  readonly snippet?: string;
}

export interface OldataSearchPage {
  readonly hits: readonly OldataHit[];
  readonly total: number;
  /** True when `total` is the endpoint's ceiling rather than a real count. */
  readonly totalIsCapped: boolean;
}

export interface OldataCase {
  readonly id: string;
  readonly court: string;
  readonly courtSlug?: string;
  readonly fileNumber: string;
  readonly date: string;
  readonly decisionType?: string;
  readonly ecli?: string;
  readonly sourceUrl?: string;
  readonly markdown: string;
}

export interface OldataSearchOptions {
  readonly jurisdiction?: string;
  readonly court?: string;
  readonly limit?: number;
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  // The API returns "None" as a string where a field is unset, and an empty
  // string for a missing ECLI. Both mean absent and must not reach a caller as
  // if they were values.
  return trimmed === '' || trimmed === 'None' ? undefined : trimmed;
}

function toHit(raw: Record<string, unknown>): OldataHit {
  const snippets = raw.snippets;
  const firstSnippet = Array.isArray(snippets) && snippets.length > 0
    ? String((snippets[0] as { text?: unknown }).text ?? '')
    : '';
  return {
    id: String(raw.id ?? ''),
    court: String(raw.court ?? ''),
    date: String(raw.date ?? ''),
    slug: String(raw.slug ?? ''),
    ...(text(raw.court_jurisdiction) ? { jurisdiction: text(raw.court_jurisdiction)! } : {}),
    ...(text(raw.court_level_of_appeal) ? { levelOfAppeal: text(raw.court_level_of_appeal)! } : {}),
    ...(text(raw.decision_type) ? { decisionType: text(raw.decision_type)! } : {}),
    ...(firstSnippet
      ? { snippet: firstSnippet.replace(/<\/?em>/g, '«').replace(/«([^«]*)«/g, '«$1»') }
      : {}),
  };
}

export class OldataClient {
  constructor(private readonly http: Pick<AxiosInstance, 'get'> = axios) {}

  private async getJson(path: string, params: Record<string, string>): Promise<unknown> {
    const response = await this.http.get(`${BASE_URL}${path}`, {
      params,
      headers: { 'User-Agent': HTTP_USER_AGENT, Accept: 'application/json' },
    });
    return response.data;
  }

  async search(query: string, options: OldataSearchOptions = {}): Promise<OldataSearchPage> {
    const params: Record<string, string> = { text: query };
    if (options.jurisdiction) params.court_jurisdiction = options.jurisdiction;
    if (options.court) params.court = options.court;
    logger.info('Searching Open Legal Data', { query, ...options });

    const data = await this.getJson('/cases/search/', params) as {
      count?: number; results?: Record<string, unknown>[];
    };
    const results = data.results ?? [];
    const total = Number(data.count ?? results.length);
    return {
      hits: results.slice(0, options.limit ?? 10).map(toHit),
      total,
      totalIsCapped: total >= COUNT_CAP,
    };
  }

  async getCase(id: string): Promise<OldataCase> {
    const data = await this.getJson(`/cases/${encodeURIComponent(id)}/`, {}) as
      Record<string, unknown>;
    const court = data.court as { name?: string; slug?: string } | undefined;
    return {
      id: String(data.id ?? id),
      court: court?.name ?? '',
      fileNumber: String(data.file_number ?? ''),
      date: String(data.date ?? ''),
      markdown: turndown.turndown(String(data.content ?? ''))
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
      ...(court?.slug ? { courtSlug: court.slug } : {}),
      ...(text(data.type) ? { decisionType: text(data.type)! } : {}),
      ...(text(data.ecli) ? { ecli: text(data.ecli)! } : {}),
      // Placeholder source URLs appear in the data; passing one through would
      // offer a caller a citation that leads nowhere.
      ...(text(data.source_url) && !String(data.source_url).includes('example.com')
        ? { sourceUrl: String(data.source_url) }
        : {}),
    };
  }

  caseUrl(slugOrId: string): string {
    return `https://de.openlegaldata.io/case/${slugOrId}`;
  }
}
