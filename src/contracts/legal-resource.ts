export const LEGAL_RESOURCE_TYPES = [
  'case-law',
  'legislation',
  'literature',
  'parliamentary-material',
  'technical-standard',
] as const;

export type LegalResourceType = (typeof LEGAL_RESOURCE_TYPES)[number];

export type ProviderAccess = 'public' | 'credentialed' | 'subscription';

export type FullTextStoragePolicy =
  | 'allowed'
  | 'cache-only'
  | 'prohibited'
  | 'unknown';

export type RedistributionPolicy =
  | 'allowed'
  | 'metadata-only'
  | 'prohibited'
  | 'unknown';

export interface LegalResourceRights {
  readonly access: ProviderAccess;
  readonly fullTextStorage: FullTextStoragePolicy;
  readonly redistribution: RedistributionPolicy;
}

export interface LegalResourceProvenance {
  readonly providerId: string;
  readonly sourceId: string;
  readonly providerDocumentId: string;
  readonly canonicalUrl?: string;
  readonly retrievedAt?: string;
}

export interface LegalResourceReference {
  readonly resourceType: LegalResourceType;
  readonly title: string;
  readonly jurisdiction?: string;
  readonly language?: string;
  readonly decisionDate?: string;
  readonly publicationDate?: string;
  readonly provenance: LegalResourceProvenance;
  readonly rights: LegalResourceRights;
}

export interface CaseLawReference extends LegalResourceReference {
  readonly resourceType: 'case-law';
  readonly court?: string;
  readonly fileNumber?: string;
  readonly ecli?: string;
}

export interface LegislationReference extends LegalResourceReference {
  readonly resourceType: 'legislation';
  readonly eli?: string;
  readonly celex?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
}

export interface LiteratureReference extends LegalResourceReference {
  readonly resourceType: 'literature';
  readonly authors?: readonly string[];
  readonly journal?: string;
  readonly doi?: string;
}

export interface ParliamentaryMaterialReference extends LegalResourceReference {
  readonly resourceType: 'parliamentary-material';
  readonly documentNumber?: string;
  readonly legislativePeriod?: number;
  readonly issuer?: string;
}

export interface TechnicalStandardReference extends LegalResourceReference {
  readonly resourceType: 'technical-standard';
  readonly documentNumber?: string;
  readonly standardBodies?: readonly string[];
  readonly valid?: boolean;
}

/**
 * Closed union of the normalized reference shapes currently supported by the
 * package. Multi-domain providers use this (or a narrower union) as their
 * discriminated result type; consumers narrow on `resourceType`.
 */
export type KnownLegalResourceReference =
  | CaseLawReference
  | LegislationReference
  | LiteratureReference
  | ParliamentaryMaterialReference
  | TechnicalStandardReference;

export interface LegalResourceContent {
  readonly format: 'markdown' | 'html' | 'text' | 'xml';
  readonly value: string;
}

export interface LegalResourceDocument<TReference extends LegalResourceReference = LegalResourceReference> {
  readonly reference: TReference;
  readonly content: LegalResourceContent;
}

export interface LegalSearchRequest {
  readonly query: string;
  readonly resourceTypes?: readonly LegalResourceType[];
  readonly jurisdictions?: readonly string[];
  readonly sourceIds?: readonly string[];
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ProviderFailure {
  readonly sourceId: string;
  readonly message: string;
  readonly cause?: unknown;
}

export interface LegalSearchPage<TReference extends LegalResourceReference = LegalResourceReference> {
  readonly results: readonly TReference[];
  readonly failures: readonly ProviderFailure[];
  readonly nextCursor?: string;
}

export interface LegalDataProvider<
  TReference extends LegalResourceReference = LegalResourceReference,
  TDocument extends LegalResourceDocument<TReference> = LegalResourceDocument<TReference>,
> {
  search(request: LegalSearchRequest): Promise<LegalSearchPage<TReference>>;
  get(reference: TReference): Promise<TDocument>;
}
