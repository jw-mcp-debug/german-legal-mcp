export const LEGAL_RESOURCE_TYPES = [
  'case-law',
  'legislation',
  'literature',
  'parliamentary-material',
  'technical-standard',
  'administrative-guidance',
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
  | 'share-alike'
  | 'metadata-only'
  | 'prohibited'
  | 'unknown';

export interface LegalResourceRights {
  readonly access: ProviderAccess;
  readonly fullTextStorage: FullTextStoragePolicy;
  /**
   * What a consumer may do — the policy a serving gate enforces.
   *
   * `share-alike` is not a softer `allowed`: the text may be served, but
   * attribution is mandatory and the obligation propagates to derived
   * databases. Collapsing it into `allowed` would make a licence's conditions
   * invisible to the code meant to honour them.
   */
  readonly redistribution: RedistributionPolicy;
  /**
   * What the source actually says, as an SPDX identifier or expression —
   * `ODbL-1.0`, `CC-BY-4.0`, `CC-BY-NC-4.0`, `DL-DE-BY-2.0`, or a
   * `LicenseRef-…` for terms with no SPDX entry.
   *
   * Deliberately separate from `redistribution`: this is the *fact*, that is
   * the *assessment*. Keeping them apart is what makes the assessment
   * auditable — and lets a consumer render the right attribution and reason
   * about compatibility between two share-alike sources, which a policy enum
   * alone cannot express.
   *
   * `NOASSERTION` means nobody has determined it yet. It is SPDX's own term
   * for exactly that, and it pairs with `redistribution: 'unknown'`.
   */
  readonly licence: string;
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
  /** Deciding body within the court — "1. Zivilsenat", "Großer Senat". */
  readonly chamber?: string;
  /** "Urteil", "Beschluss", "Versäumnisurteil" — as the source names it. */
  readonly documentType?: string;
  /**
   * Norms the court applied, as published: `§ 8 Abs 2 Nr 1 MarkenG`.
   *
   * Optional because most sources make a consumer find these in the prose.
   * Where a source states them — RII does, in its XML distribution — carrying
   * them through is the difference between reading a citation graph off the
   * document and inferring one from running text.
   */
  readonly citedNorms?: readonly string[];
  /** Prior instances, as the source states them. */
  readonly priorInstances?: readonly string[];
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

/**
 * How much weight a house document carries — the question a reader of an
 * internal source asks first and a legal portal never has to answer.
 *
 * A statute is binding because of what it is. A Handreichung is binding,
 * advisory or merely descriptive depending on who issued it and why, and
 * nothing in its text or file name says which. Left unmodelled, a FAQ and a
 * Gremienbeschluss arrive at a caller looking identical.
 *
 * `draft` is carried by the type but not populated in the published-sources
 * distribution, which admits finished documents only. It exists so that adding
 * a draft corpus later is a configuration change rather than a schema
 * migration.
 */
export type NormativeForce =
  /** Gremienbeschluss, Dienstanweisung, signed agreement — it governs. */
  | 'binding'
  /** Handreichung, Arbeitshilfe, FAQ, Merkblatt — it advises. */
  | 'guidance'
  /** Protokoll, correspondence — it documents; it does not regulate. */
  | 'record'
  /** Entwurf, Angebot, unnegotiated terms — not agreed, never quotable as such. */
  | 'draft';

/**
 * Whether the document still applies.
 *
 * `unknown` is not a defect to be cleaned up; it is what a re-crawl reports
 * when a source URL stops answering. A vanished page may be a move or a
 * withdrawal, and only the responsible office can say which — so the index
 * records the ambiguity instead of resolving it by deletion, which would erase
 * exactly the signal an editor needs to act on.
 */
export type DocumentStatus =
  | 'in-force'
  | 'draft'
  | 'superseded'
  | 'expired'
  | 'unknown';

/**
 * Who may see it — the question `LegalResourceRights` does not ask.
 *
 * `rights.redistribution` governs passing a text on to third parties under its
 * licence. This governs whether the text may be surfaced at all. The two come
 * apart routinely: a supplier's terms are publicly readable yet not ours to
 * republish, while an internal Arbeitshilfe is ours entirely and still must not
 * leave the house.
 *
 * The published-sources distribution indexes `public` only, and enforces that
 * at ingest rather than per query — the cheaper place, and the one where a
 * mistake is visible to a person.
 */
export type Confidentiality = 'public' | 'internal' | 'restricted';

/**
 * Whether this rendering is the promulgated one.
 *
 * The same rule routinely exists twice: promulgated in the gazette, and again
 * as a consolidated reading version on a web page. The reading version is the
 * one a person can actually use — the gazette publishes amendments separately
 * and never consolidates — while the gazette is the one that governs if the
 * two disagree.
 *
 * Modelled apart from `normativeForce` because the two answer different
 * questions. A consolidated Geschäftsordnung is fully binding as a rule
 * (`normativeForce: 'binding'`) and simultaneously not authoritative as a text
 * (`authority: 'reading-version'`). Collapsing them would force a choice
 * between overstating the page and understating the rule.
 */
export type DocumentAuthority = 'official' | 'reading-version';

/**
 * A document that explains or governs house practice, rather than stating law.
 *
 * The distinction matters at the point of use: these sources answer "how do we
 * proceed here", never "what is the legal position". A consumer that renders
 * them without `normativeForce` and `asOf` invites precisely the confusion the
 * type exists to prevent.
 */
export interface AdministrativeGuidanceReference extends LegalResourceReference {
  readonly resourceType: 'administrative-guidance';
  readonly normativeForce: NormativeForce;
  readonly status: DocumentStatus;
  readonly confidentiality: Confidentiality;
  readonly authority: DocumentAuthority;
  /**
   * Where the promulgated text of this rule can be found, for a reading
   * version. Carrying it is what lets a consumer answer "and where does that
   * officially say so" without a second search.
   */
  readonly authoritativeSource?: string;
  /** "Stand", as the document states it — not when it was fetched. */
  readonly asOf?: string;
  /** The office that maintains it, and therefore the address for a correction. */
  readonly owner?: string;
  /** Identifier of the successor, where a source names one. */
  readonly supersededBy?: string;
  /** "Handreichung", "FAQ", "Merkblatt", "Beschluss" — as the source names it. */
  readonly documentType?: string;
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
  | TechnicalStandardReference
  | AdministrativeGuidanceReference;

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
