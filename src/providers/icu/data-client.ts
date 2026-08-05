import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  CaseLawReference,
  LegalDataProvider,
  LegalResourceDocument,
  LegalSearchPage,
  LegalSearchRequest,
} from '../../contracts/legal-resource.js';
import { IcuConverter } from './converter.js';
import { classifyIcuError } from './errors.js';

const SEARCH_URL = 'https://infocuriaws.curia.europa.eu/elastic-connector/search';
const BLOB_URL = 'https://infocuriaws.curia.europa.eu/blob/download-file';
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Accept': 'application/json',
  'Origin': 'https://infocuria.curia.europa.eu',
};

const RIGHTS = {
  access: 'public',
  fullTextStorage: 'allowed',
  redistribution: 'unknown',
} as const;

export interface IcuSearchHit {
  readonly docType?: string;
  readonly docDate?: string;
  readonly idPublished?: string;
  readonly ecli?: string;
  readonly celex?: string;
  readonly affairJurisdiction?: string;
  readonly logicDocId?: string;
}

export class IcuDataClient implements LegalDataProvider<CaseLawReference> {
  constructor(
    private readonly http: Pick<AxiosInstance, 'get' | 'post'> = axios,
    private readonly converter: IcuConverter = new IcuConverter(),
  ) {}

  async searchCaseLaw(query: string, language = 'DE', limit = 10): Promise<{
    totalHits: number;
    hits: IcuSearchHit[];
  }> {
    const response = await this.request(() => this.http.post(SEARCH_URL, {
      searchTerm: query,
      multiSearchTerms: [],
      sortTermList: [{ sortDirection: 'DESC', sortTerm: 'ALL_DATES' }],
      pagination: { pageNumber: 0, pageSize: limit, from: 1, to: limit * 2 },
      language: language.toUpperCase(),
      tabName: 'tout_jurisprudence',
      isAllTabsRequest: false,
      isSearchExact: true,
      searchSources: ['document', 'metadata'],
      ecli: '', publishedId: '', usualName: '', logicDocId: '',
    }, { headers: HEADERS }));
    return {
      totalHits: response.data.totalHits ?? 0,
      hits: (response.data.searchHits ?? []).map(
        (hit: { content?: IcuSearchHit }) => hit.content ?? {},
      ),
    };
  }

  async getCaseLaw(caseId: string, language = 'DE'): Promise<{
    logicDocId: string;
    markdown: string;
  } | null> {
    const logicDocId = await this.resolveLogicDocId(caseId, language);
    if (!logicDocId) return null;
    const numericId = logicDocId.replace('id_', '');
    const response = await this.request(() => this.http.get<string>(
      `${BLOB_URL}/${numericId}/${language.toUpperCase()}/html`,
      {
        headers: { 'Origin': 'https://infocuria.curia.europa.eu' },
        responseType: 'text',
      },
    ));
    return { logicDocId, markdown: this.converter.convert(response.data) };
  }

  async search(request: LegalSearchRequest): Promise<LegalSearchPage<CaseLawReference>> {
    if (request.resourceTypes && !request.resourceTypes.includes('case-law')) {
      return { results: [], failures: [] };
    }
    if (request.jurisdictions && !request.jurisdictions.some((id) => id.toUpperCase() === 'EU')) {
      return { results: [], failures: [] };
    }
    if (request.sourceIds && !request.sourceIds.includes('icu:infocuria')) {
      return { results: [], failures: [] };
    }
    const response = await this.searchCaseLaw(request.query, 'DE', request.limit ?? 10);
    return { results: response.hits.map(toReference), failures: [] };
  }

  async get(reference: CaseLawReference): Promise<LegalResourceDocument<CaseLawReference>> {
    assertReference(reference);
    const result = await this.getCaseLaw(
      reference.provenance.providerDocumentId,
      reference.language?.toUpperCase() ?? 'DE',
    );
    if (!result) throw new Error(`InfoCuria document ${reference.provenance.providerDocumentId} not found.`);
    return {
      reference,
      content: { format: 'markdown', value: result.markdown },
    };
  }

  private async request<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw classifyIcuError(error);
    }
  }

  private async resolveLogicDocId(caseId: string, language: string): Promise<string | null> {
    if (caseId.startsWith('id_')) return caseId;
    if (/^\d+$/.test(caseId)) return `id_${caseId}`;

    if (isCelex(caseId)) return this.searchLogicDocId(caseId, language);

    // A bare published case number ("C-476/17") cannot be looked up directly:
    // InfoCuria has no exact case-number filter, so the `publishedId` field it
    // was passed in is simply ignored and the search returns nothing (or, as
    // free text, hundreds of loosely related hits with the wrong case first).
    // The CELEX number is a deterministic transform of it, and searching for
    // that works — so convert and use the path that does.
    for (const candidate of celexCandidates(caseId)) {
      const found = await this.searchLogicDocId(candidate, language);
      if (found) return found;
    }
    return null;
  }

  private async searchLogicDocId(celex: string, language: string): Promise<string | null> {
    const body: Record<string, unknown> = {
      searchTerm: celex,
      multiSearchTerms: [],
      sortTermList: [{ sortDirection: 'DESC', sortTerm: 'ALL_DATES' }],
      pagination: { pageNumber: 0, pageSize: 1, from: 1, to: 2 },
      language: language.toUpperCase(),
      tabName: 'tout_jurisprudence',
      isAllTabsRequest: false,
      isSearchExact: true,
      searchSources: ['document', 'metadata'],
      ecli: '', publishedId: '', usualName: '', logicDocId: '',
    };
    const response = await this.request(() => this.http.post(SEARCH_URL, body, { headers: HEADERS }));
    return response.data.searchHits?.[0]?.content?.logicDocId ?? null;
  }
}

function isCelex(value: string): boolean {
  return /^\d{5}[A-Z]{2}\d+$/.test(value);
}

/**
 * Build CELEX candidates for a published CJEU case number.
 *
 * CELEX case-law ids are `6` + four-digit year + a two-letter document code +
 * the case number padded to four digits. Verified against live InfoCuria data:
 *
 *   C-476/17  → 62017CJ0476        T-108/25  → 62025TJ0108
 *   C-797/23  → 62023CJ0797
 *
 * The court comes from the prefix (C = Court of Justice, T = General Court), but
 * the document code also encodes judgment vs. order, which the case number does
 * not reveal — so both are returned, judgments first as the common case.
 */
export function celexCandidates(caseId: string): string[] {
  const match = caseId
    .trim()
    .toUpperCase()
    .match(/^(C|T|F)[-\s]?(\d+)\/(\d{2,4})$/);
  if (!match) return [];

  const [, prefix, rawNumber, rawYear] = match;
  if (!prefix || !rawNumber || !rawYear) return [];

  // Two-digit years: InfoCuria's case numbering starts in 1953, so anything
  // below 54 belongs to the 2000s.
  const year = rawYear.length === 4
    ? Number(rawYear)
    : Number(rawYear) < 54 ? 2000 + Number(rawYear) : 1900 + Number(rawYear);
  const number = rawNumber.padStart(4, '0');
  const codes = prefix === 'C' ? ['CJ', 'CO'] : prefix === 'T' ? ['TJ', 'TO'] : ['FJ', 'FO'];

  return codes.map((code) => `6${year}${code}${number}`);
}

function toReference(hit: IcuSearchHit): CaseLawReference {
  const title = [hit.docType, hit.idPublished].filter(Boolean).join(' – ')
    || hit.ecli
    || hit.logicDocId
    || 'InfoCuria decision';
  const canonicalUrl = canonicalUrlFor(hit);
  return {
    resourceType: 'case-law',
    title,
    jurisdiction: 'EU',
    language: 'de',
    ...(hit.docDate ? { decisionDate: hit.docDate } : {}),
    ...(hit.affairJurisdiction ? { court: hit.affairJurisdiction } : {}),
    ...(hit.idPublished ? { fileNumber: hit.idPublished } : {}),
    ...(hit.ecli ? { ecli: hit.ecli } : {}),
    provenance: {
      providerId: 'icu',
      sourceId: 'icu:infocuria',
      providerDocumentId: hit.logicDocId ?? hit.idPublished ?? hit.celex ?? '',
      ...(canonicalUrl ? { canonicalUrl } : {}),
    },
    rights: RIGHTS,
  };
}

/**
 * Not every InfoCuria hit carries a CELEX id (orders and some undocketed
 * decisions don't), so fall back to EUR-Lex's ECLI lookup, which resolves to
 * the same document text. Both forms were verified to return the full
 * decision.
 *
 * Deliberately no `curia.europa.eu/juris/...` fallback: those URLs answer 200
 * but serve only a JavaScript shell (no document text), so they would hand
 * consumers a dead link that merely looks authoritative. Returning nothing is
 * more honest — `canonicalUrl` is optional in the contract for exactly this
 * case.
 */
function canonicalUrlFor(hit: IcuSearchHit): string | undefined {
  if (hit.celex) {
    return `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${hit.celex}`;
  }
  if (hit.ecli) {
    return `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=ecli:${hit.ecli}`;
  }
  return undefined;
}

function assertReference(reference: CaseLawReference): void {
  if (reference.provenance.providerId !== 'icu') {
    throw new Error(`Reference does not belong to icu: ${reference.provenance.providerId}`);
  }
}
