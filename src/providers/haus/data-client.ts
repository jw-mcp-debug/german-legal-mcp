import type {
  AdministrativeGuidanceReference,
  LegalDataProvider,
  LegalResourceDocument,
  LegalSearchPage,
  LegalSearchRequest,
} from '../../contracts/legal-resource.js';
import type {
  CorpusEnumerationCapability,
  CorpusEnumerationPage,
  CorpusEnumerationRequest,
} from '../../contracts/provider-capabilities.js';
import type { HausDocumentRecord, HausIndexStore, HausSearchFilters } from './store.js';

export function toReference(record: HausDocumentRecord): AdministrativeGuidanceReference {
  return {
    resourceType: 'administrative-guidance',
    title: record.title,
    normativeForce: record.normativeForce,
    status: record.status,
    confidentiality: record.confidentiality,
    authority: record.authority,
    provenance: {
      providerId: 'haus',
      sourceId: record.sourceId,
      providerDocumentId: record.id,
      canonicalUrl: record.url,
      retrievedAt: record.retrievedAt,
    },
    rights: {
      access: 'public',
      fullTextStorage: 'allowed',
      redistribution: record.redistribution as AdministrativeGuidanceReference['rights']['redistribution'],
      licence: record.licence,
    },
    ...(record.language ? { language: record.language } : {}),
    ...(record.asOf ? { asOf: record.asOf, publicationDate: record.asOf } : {}),
    ...(record.owner ? { owner: record.owner } : {}),
    ...(record.documentType ? { documentType: record.documentType } : {}),
    ...(record.supersededBy ? { supersededBy: record.supersededBy } : {}),
    ...(record.authoritativeSource ? { authoritativeSource: record.authoritativeSource } : {}),
  };
}

/**
 * The typed component projection of the house index.
 *
 * It reads a local SQLite file, so unlike every other provider here it has no
 * network dependency and cannot fail with an outage — the failure modes are an
 * absent index and a stale one, which is why `enumerate` and the coverage
 * reporting matter more than retries.
 */
export class HausDataClient
implements
  LegalDataProvider<AdministrativeGuidanceReference>,
  CorpusEnumerationCapability<AdministrativeGuidanceReference> {
  constructor(private readonly store: HausIndexStore) {}

  async search(request: LegalSearchRequest): Promise<LegalSearchPage<AdministrativeGuidanceReference>> {
    const offset = request.cursor ? Number.parseInt(request.cursor, 10) : 0;
    const limit = request.limit ?? 10;
    const filters: HausSearchFilters = { limit, offset };
    const rows = this.store.search(request.query, filters);
    const nextCursor = rows.length === limit ? String(offset + limit) : undefined;
    return {
      results: rows.map(toReference),
      failures: [],
      ...(nextCursor ? { nextCursor } : {}),
    };
  }

  async get(
    reference: AdministrativeGuidanceReference,
  ): Promise<LegalResourceDocument<AdministrativeGuidanceReference>> {
    const record = this.store.get(reference.provenance.providerDocumentId)
      ?? (reference.provenance.canonicalUrl
        ? this.store.getByUrl(reference.provenance.canonicalUrl)
        : null);
    if (!record) {
      throw new Error(`Not in the house index: ${reference.provenance.providerDocumentId}`);
    }
    return {
      reference: toReference(record),
      content: { format: 'markdown', value: record.body },
    };
  }

  /**
   * `origin` is `native`: the bound is a SQL predicate on an indexed column, so
   * an incremental run costs what the delta costs and nothing more.
   */
  async enumerate(
    request: CorpusEnumerationRequest = {},
  ): Promise<CorpusEnumerationPage<AdministrativeGuidanceReference>> {
    const limit = request.limit ?? 100;
    const offset = request.cursor ? Number.parseInt(request.cursor, 10) : 0;
    const rows = this.store.enumerate(request.since, limit, offset);
    const nextCursor = rows.length === limit ? String(offset + limit) : undefined;
    return {
      results: rows.map(toReference),
      failures: [],
      origin: 'native',
      ...(nextCursor ? { nextCursor } : {}),
    };
  }
}
