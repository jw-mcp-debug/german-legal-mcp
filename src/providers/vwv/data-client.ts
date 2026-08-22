import type {
  AdministrativeGuidanceReference,
  LegalDataProvider,
  LegalResourceDocument,
  LegalSearchPage,
  LegalSearchRequest,
} from '../../contracts/legal-resource.js';
import { VwvClient } from './client.js';

export const VWV_SOURCE_ID = 'vwv-bund';

/**
 * Administrative regulations bind the administration, not the citizen. That is
 * `administrative-guidance` in this package's terms — the same shape the house
 * corpus uses, which lets a caller compare a federal Verwaltungsvorschrift and
 * an institutional Ordnung without translating between two models.
 *
 * `authority: 'official'` because these are the promulgated texts, and
 * `normativeForce: 'binding'` because a Verwaltungsvorschrift binds the
 * authority that issued it — not because it binds anyone outside it.
 */
const RIGHTS = {
  access: 'public',
  fullTextStorage: 'allowed',
  redistribution: 'unknown',
  licence: 'NOASSERTION',
} as const;

function reference(
  docId: string,
  title: string,
  url: string,
  issuer?: string,
): AdministrativeGuidanceReference {
  return {
    resourceType: 'administrative-guidance',
    title,
    jurisdiction: 'DE',
    language: 'de',
    normativeForce: 'binding',
    status: 'in-force',
    confidentiality: 'public',
    authority: 'official',
    provenance: {
      providerId: 'vwv',
      sourceId: VWV_SOURCE_ID,
      providerDocumentId: docId,
      canonicalUrl: url,
    },
    rights: RIGHTS,
    ...(issuer ? { owner: issuer } : {}),
  };
}

export class VwvDataClient implements LegalDataProvider<AdministrativeGuidanceReference> {
  constructor(private readonly client: VwvClient = new VwvClient()) {}

  async search(
    request: LegalSearchRequest,
  ): Promise<LegalSearchPage<AdministrativeGuidanceReference>> {
    const page = await this.client.search(request.query, 'fulltext');
    const limit = request.limit ?? 10;
    const index = await this.client.getTitleIndex().catch(() => []);

    const results = page.hits.slice(0, limit).map((hit) => {
      const entry = index.find((candidate) => candidate.docId === hit.docId);
      // Without a listing entry the id is all the portal gives, so the snippet
      // stands in for a title rather than leaving the row unreadable.
      const title = entry?.title ?? hit.snippet.slice(0, 120) ?? hit.docId;
      return reference(hit.docId, title, this.client.documentUrl(hit.docId), entry?.issuer);
    });

    return { results, failures: [] };
  }

  async get(
    ref: AdministrativeGuidanceReference,
  ): Promise<LegalResourceDocument<AdministrativeGuidanceReference>> {
    const docId = ref.provenance.providerDocumentId;
    const document = await this.client.getDocument(docId);
    const issuer = (await this.client.getTitleIndex().catch(() => []))
      .find((entry) => entry.docId === docId)?.issuer;
    return {
      reference: reference(
        docId,
        document.title,
        this.client.documentUrl(docId),
        issuer,
      ),
      content: { format: 'markdown', value: document.markdown },
    };
  }
}
