import type {
  LegalDataProvider,
  LegalResourceDocument,
  LegalSearchPage,
  LegalSearchRequest,
  ParliamentaryMaterialReference,
} from '../../contracts/legal-resource.js';
import { DipClient, type DipDocument } from './client.js';

const RIGHTS = {
  access: 'public',
  fullTextStorage: 'allowed',
  redistribution: 'allowed',
} as const;

export class DipDataClient implements LegalDataProvider<ParliamentaryMaterialReference> {
  constructor(private readonly transport: DipClient = new DipClient()) {}

  searchDrucksachen(params: Record<string, string | number>) {
    return this.transport.searchDrucksachen(params);
  }

  searchDrucksachenText(params: Record<string, string | number>) {
    return this.transport.searchDrucksachenText(params);
  }

  searchVorgang(params: Record<string, string | number>) {
    return this.transport.searchVorgang(params);
  }

  searchPlenarprotokollText(params: Record<string, string | number>) {
    return this.transport.searchPlenarprotokollText(params);
  }

  getDrucksache(id: string) {
    return this.transport.getDrucksache(id);
  }

  async search(request: LegalSearchRequest): Promise<LegalSearchPage<ParliamentaryMaterialReference>> {
    if (request.resourceTypes && !request.resourceTypes.includes('parliamentary-material')) {
      return { results: [], failures: [] };
    }
    if (request.jurisdictions && !request.jurisdictions.some((id) => id.toUpperCase() === 'DE')) {
      return { results: [], failures: [] };
    }
    if (request.sourceIds && !request.sourceIds.includes('dip:bundestag')) {
      return { results: [], failures: [] };
    }
    const response = await this.searchDrucksachen({
      'f.titel': request.query,
      rows: request.limit ?? 10,
      ...(request.cursor ? { cursor: request.cursor } : {}),
    });
    return {
      results: response.documents.map(toReference),
      failures: [],
      ...(response.cursor ? { nextCursor: response.cursor } : {}),
    };
  }

  async get(reference: ParliamentaryMaterialReference): Promise<LegalResourceDocument<ParliamentaryMaterialReference>> {
    assertReference(reference);
    const document = await this.getDrucksache(reference.provenance.providerDocumentId);
    if (!document) throw new Error(`DIP document ${reference.provenance.providerDocumentId} not found.`);
    return {
      reference: toReference(document),
      content: {
        format: 'text',
        value: document.text ?? document.titel,
      },
    };
  }
}

function toReference(document: DipDocument): ParliamentaryMaterialReference {
  return {
    resourceType: 'parliamentary-material',
    title: document.titel.replace(/\r?\n/g, ' ').trim(),
    jurisdiction: 'DE',
    language: 'de',
    publicationDate: document.datum,
    ...(document.dokumentnummer ? { documentNumber: document.dokumentnummer } : {}),
    ...(document.wahlperiode ? { legislativePeriod: document.wahlperiode } : {}),
    ...(document.herausgeber ? { issuer: document.herausgeber } : {}),
    provenance: {
      providerId: 'dip',
      sourceId: 'dip:bundestag',
      providerDocumentId: document.id,
      ...(document.fundstelle?.pdf_url ? { canonicalUrl: document.fundstelle.pdf_url } : {}),
    },
    rights: RIGHTS,
  };
}

function assertReference(reference: ParliamentaryMaterialReference): void {
  if (reference.provenance.providerId !== 'dip') {
    throw new Error(`Reference does not belong to dip: ${reference.provenance.providerId}`);
  }
}
