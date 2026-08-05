import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  CaseLawReference,
  LegalDataProvider,
  LegalResourceDocument,
  LegalResourceRights,
  LegalSearchPage,
  LegalSearchRequest,
} from '../../contracts/legal-resource.js';
import { invalidateAllSessions } from '../../shared/clients/jportal.js';
import { RiiConverter } from './converter.js';
import { BayernDecisionAdapter } from './adapters/bayern.js';
import { BrandenburgDecisionAdapter } from './adapters/brandenburg.js';
import { BremenDecisionAdapter } from './adapters/bremen.js';
import { FederalDecisionAdapter } from './adapters/federal.js';
import { JPortalDecisionAdapter } from './adapters/jportal.js';
import { NiedersachsenDecisionAdapter } from './adapters/niedersachsen.js';
import { NRWDecisionAdapter } from './adapters/nrw.js';
import { SachsenDecisionAdapter } from './adapters/sachsen.js';
import type {
  DecisionAdapter,
  DecisionEntry,
  DecisionGetOptions,
  DecisionSearchBatch,
  DecisionSearchResult,
  SourcedDecisionSearchResult,
} from './types.js';

export const GERMAN_CASE_LAW_PROVIDER_ID = 'de-case-law';

export const PUBLIC_CASE_LAW_RIGHTS = {
  access: 'public',
  fullTextStorage: 'allowed',
  redistribution: 'unknown',
} as const satisfies LegalResourceRights;

export interface CaseLawSearchOptions {
  sources?: readonly string[] | 'ALL';
  limit?: number;
  limitPerSource?: number;
}

export interface CaseLawClientConfiguration {
  readonly providerId: string;
  readonly language: string;
  readonly locale: string;
  readonly rights: LegalResourceRights;
  readonly jurisdictionForSource: (source: string) => string | undefined;
  readonly sourceForJurisdiction: (jurisdiction: string) => string | undefined;
  readonly shutdown?: () => void;
}

export function createGermanDecisionAdapters(
  http: Pick<AxiosInstance, 'get' | 'post'> = axios,
  converter: RiiConverter = new RiiConverter(),
): readonly DecisionAdapter[] {
  return [
    new FederalDecisionAdapter(http, converter),
    new BayernDecisionAdapter(),
    new NRWDecisionAdapter(http),
    new JPortalDecisionAdapter(),
    new NiedersachsenDecisionAdapter(http),
    new BrandenburgDecisionAdapter(http),
    new BremenDecisionAdapter(http),
    new SachsenDecisionAdapter(http),
  ];
}

export const GERMAN_CASE_LAW_CONFIGURATION: CaseLawClientConfiguration = {
  providerId: GERMAN_CASE_LAW_PROVIDER_ID,
  language: 'de',
  locale: 'de-DE',
  rights: PUBLIC_CASE_LAW_RIGHTS,
  jurisdictionForSource: (source) => source === 'BUND' ? 'DE' : `DE-${source}`,
  sourceForJurisdiction: (jurisdiction) => {
    const normalized = jurisdiction.toUpperCase();
    if (normalized === 'DE') return 'BUND';
    return normalized.startsWith('DE-') ? normalized.slice(3) : undefined;
  },
  shutdown: invalidateAllSessions,
};

export class CaseLawClient implements LegalDataProvider<CaseLawReference> {
  private readonly adapters: readonly DecisionAdapter[];
  private readonly adapterBySource = new Map<string, DecisionAdapter>();

  constructor(
    adapters: readonly DecisionAdapter[] = createGermanDecisionAdapters(),
    private readonly configuration: CaseLawClientConfiguration = GERMAN_CASE_LAW_CONFIGURATION,
  ) {
    this.adapters = adapters;
    for (const adapter of adapters) {
      for (const source of adapter.sources) {
        if (this.adapterBySource.has(source)) {
          throw new Error(`Duplicate case-law source: ${source}`);
        }
        this.adapterBySource.set(source, adapter);
      }
    }
  }

  get sources(): readonly string[] {
    return [...this.adapterBySource.keys()];
  }

  async searchDecisions(
    query: string,
    options: CaseLawSearchOptions = {},
  ): Promise<DecisionSearchBatch> {
    const limit = Math.max(1, options.limit ?? 10);
    const limitPerSource = Math.max(1, options.limitPerSource ?? limit);
    const sources = options.sources === undefined || options.sources === 'ALL'
      ? this.sources
      : options.sources;

    const searches = sources.map(async (source) => {
      const adapter = this.adapterBySource.get(source);
      if (!adapter) throw new Error(`Unknown case-law source: ${source}`);
      return {
        source,
        results: await adapter.search(source, query, limitPerSource),
      };
    });
    const settled = await Promise.allSettled(searches);
    const successful = settled.filter((item): item is PromiseFulfilledResult<{
      source: string;
      results: DecisionSearchResult[];
    }> => item.status === 'fulfilled');
    const queryTerms = query
      .toLocaleLowerCase(this.configuration.locale)
      .split(/\s+/)
      .filter((term) => term.length > 1);
    const seen = new Set<string>();

    const results = successful
      .flatMap(({ value }) => value.results.map((result): SourcedDecisionSearchResult => ({
        ...result,
        source: value.source,
      })))
      .filter((result) => {
        const key = (
          result.ecli
          || (result.court && result.fileNumber
            ? `${result.court}|${result.fileNumber}`
            : `${result.title}|${result.date}`)
        ).toLocaleLowerCase(this.configuration.locale);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => this.searchScore(b, queryTerms) - this.searchScore(a, queryTerms))
      .slice(0, limit);

    return {
      results,
      failures: settled.flatMap((result, index) => result.status === 'rejected'
        ? [{ source: sources[index] ?? 'unknown', error: result.reason }]
        : []),
    };
  }

  async getDecision(
    source: string,
    id: string,
    options: DecisionGetOptions = {},
  ): Promise<DecisionEntry> {
    const adapter = this.adapterBySource.get(source);
    if (!adapter) throw new Error(`Unknown case-law source: ${source}`);
    return adapter.get(source, id, options);
  }

  async search(request: LegalSearchRequest): Promise<LegalSearchPage<CaseLawReference>> {
    if (request.resourceTypes && !request.resourceTypes.includes('case-law')) {
      return { results: [], failures: [] };
    }
    let requestedSources = request.sourceIds?.map((id) => {
      const prefix = `${this.configuration.providerId}:`;
      return id.startsWith(prefix) ? id.slice(prefix.length) : id;
    });
    if (request.jurisdictions) {
      const jurisdictionSources = request.jurisdictions
        .map(this.configuration.sourceForJurisdiction)
        .filter((source): source is string =>
          source !== undefined && this.adapterBySource.has(source)
        );
      requestedSources = requestedSources
        ? requestedSources.filter((source) => jurisdictionSources.includes(source))
        : jurisdictionSources;
    }
    const batch = await this.searchDecisions(request.query, {
      ...(requestedSources ? { sources: requestedSources } : {}),
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
    return {
      results: batch.results.map((result) => this.toReference(result)),
      failures: batch.failures.map((failure) => ({
        sourceId: this.sourceId(failure.source),
        message: failure.error instanceof Error ? failure.error.message : String(failure.error),
        cause: failure.error,
      })),
    };
  }

  async get(reference: CaseLawReference): Promise<LegalResourceDocument<CaseLawReference>> {
    const source = this.sourceFromReference(reference);
    const entry = await this.getDecision(source, reference.provenance.providerDocumentId);
    return {
      reference: this.toReference({
        source,
        id: reference.provenance.providerDocumentId,
        title: entry.title || reference.title,
        subtitle: '',
        date: entry.date || reference.decisionDate || '',
        court: entry.court || reference.court || '',
        fileNumber: entry.fileNumber || reference.fileNumber || '',
        ...((entry.ecli || reference.ecli)
          ? { ecli: entry.ecli || reference.ecli }
          : {}),
        ...((entry.url || reference.provenance.canonicalUrl)
          ? { url: entry.url || reference.provenance.canonicalUrl }
          : {}),
      }),
      content: { format: 'markdown', value: entry.content },
    };
  }

  shutdown(): void {
    this.configuration.shutdown?.();
  }

  private toReference(result: SourcedDecisionSearchResult): CaseLawReference {
    const jurisdiction = this.configuration.jurisdictionForSource(result.source);
    return {
      resourceType: 'case-law',
      title: result.title,
      ...(jurisdiction ? { jurisdiction } : {}),
      language: this.configuration.language,
      ...(result.date ? { decisionDate: result.date } : {}),
      ...(result.court ? { court: result.court } : {}),
      ...(result.fileNumber ? { fileNumber: result.fileNumber } : {}),
      ...(result.ecli ? { ecli: result.ecli } : {}),
      provenance: {
        providerId: this.configuration.providerId,
        sourceId: this.sourceId(result.source),
        providerDocumentId: result.id,
        ...(result.url ? { canonicalUrl: result.url } : {}),
      },
      rights: this.configuration.rights,
    };
  }

  private searchScore(
    result: Pick<DecisionSearchResult, 'title' | 'subtitle' | 'snippet'>,
    terms: readonly string[],
  ): number {
    const text = `${result.title} ${result.subtitle} ${result.snippet ?? ''}`
      .toLocaleLowerCase(this.configuration.locale);
    return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
  }

  private sourceId(source: string): string {
    return `${this.configuration.providerId}:${source}`;
  }

  private sourceFromReference(reference: CaseLawReference): string {
    const prefix = `${this.configuration.providerId}:`;
    if (!reference.provenance.sourceId.startsWith(prefix)) {
      throw new Error(
        `Reference source "${reference.provenance.sourceId}" does not belong to ${this.configuration.providerId}.`,
      );
    }
    return reference.provenance.sourceId.slice(prefix.length);
  }
}
