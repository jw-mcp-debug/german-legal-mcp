import type {
  CaseLawReference,
  LegalDataProvider,
  LegalResourceDocument,
  LegalSearchPage,
  LegalSearchRequest,
} from '../../contracts/legal-resource.js';
import { OldataClient } from './client.js';
import type { OldataCase, OldataHit } from './client.js';

export const OLDATA_SOURCE_ID = 'openlegaldata';

/**
 * Open Legal Data states no licence for its corpus, and the operator's about
 * and API pages were checked for one. The decisions themselves are amtliche
 * Werke; the compilation is a separate matter nobody has spoken to, which is
 * exactly what `unknown` and `NOASSERTION` mean.
 */
const RIGHTS = {
  access: 'public',
  fullTextStorage: 'allowed',
  redistribution: 'unknown',
  licence: 'NOASSERTION',
} as const;

function fromHit(hit: OldataHit, url: string): CaseLawReference {
  return {
    resourceType: 'case-law',
    title: [hit.court, hit.decisionType, hit.date].filter(Boolean).join(' · '),
    jurisdiction: 'DE',
    language: 'de',
    decisionDate: hit.date,
    court: hit.court,
    provenance: {
      providerId: 'oldata',
      sourceId: OLDATA_SOURCE_ID,
      providerDocumentId: hit.id,
      canonicalUrl: url,
    },
    rights: RIGHTS,
    ...(hit.decisionType ? { documentType: hit.decisionType } : {}),
  };
}

function fromCase(record: OldataCase, url: string): CaseLawReference {
  return {
    resourceType: 'case-law',
    title: [record.court, record.decisionType, record.fileNumber]
      .filter(Boolean).join(' · '),
    jurisdiction: 'DE',
    language: 'de',
    decisionDate: record.date,
    court: record.court,
    fileNumber: record.fileNumber,
    provenance: {
      providerId: 'oldata',
      sourceId: OLDATA_SOURCE_ID,
      providerDocumentId: record.id,
      canonicalUrl: url,
    },
    rights: RIGHTS,
    ...(record.decisionType ? { documentType: record.decisionType } : {}),
    ...(record.ecli ? { ecli: record.ecli } : {}),
  };
}

export class OldataDataClient implements LegalDataProvider<CaseLawReference> {
  constructor(private readonly client: OldataClient = new OldataClient()) {}

  async search(request: LegalSearchRequest): Promise<LegalSearchPage<CaseLawReference>> {
    const page = await this.client.search(request.query, { limit: request.limit ?? 10 });
    return {
      results: page.hits.map((hit) => fromHit(hit, this.client.caseUrl(hit.slug || hit.id))),
      failures: [],
    };
  }

  async get(reference: CaseLawReference): Promise<LegalResourceDocument<CaseLawReference>> {
    const record = await this.client.getCase(reference.provenance.providerDocumentId);
    return {
      reference: fromCase(record, this.client.caseUrl(record.id)),
      content: { format: 'markdown', value: record.markdown },
    };
  }
}
