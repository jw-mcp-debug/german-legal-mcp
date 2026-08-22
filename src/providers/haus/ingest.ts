import type {
  Confidentiality,
  DocumentStatus,
  NormativeForce,
} from '../../contracts/legal-resource.js';
import type { HausIndexStore, HausDocumentRecord } from './store.js';
import { contentHash, documentId } from './store.js';

/**
 * The rights a published house document carries until somebody says otherwise.
 *
 * `unknown` and `NOASSERTION` are the honest pairing for a page that states no
 * licence, which is most of them. Ingest overrides it per source where the
 * terms are actually known — a Creative-Commons footer, a supplier's own
 * conditions of use.
 */
export const DEFAULT_RIGHTS = {
  access: 'public',
  fullTextStorage: 'allowed',
  redistribution: 'unknown',
  licence: 'NOASSERTION',
} as const;

/**
 * What a crawler hands over: the fetched text plus what the source manifest
 * asserts about it. Nothing here is inferred from the document — `owner` and
 * `normativeForce` cannot be read off a PDF, and guessing them is how a FAQ
 * ends up cited as a Beschluss.
 */
export interface HausIngestInput {
  readonly url: string;
  readonly title: string;
  readonly body: string;
  readonly normativeForce: NormativeForce;
  readonly confidentiality: Confidentiality;
  readonly status?: DocumentStatus;
  readonly documentType?: string;
  readonly asOf?: string;
  readonly owner?: string;
  readonly supersededBy?: string;
  readonly language?: string;
  readonly licence?: string;
  readonly redistribution?: string;
  readonly retrievedAt?: string;
}

export class ConfidentialDocumentRejected extends Error {
  constructor(readonly url: string, readonly confidentiality: Confidentiality) {
    super(`Refusing to index a "${confidentiality}" document: ${url}`);
    this.name = 'ConfidentialDocumentRejected';
  }
}

export type IngestOutcome = 'created' | 'updated' | 'unchanged';

/**
 * Write one document into the index, or report that it has not moved.
 *
 * The confidentiality gate sits here rather than in the query path on purpose.
 * Filtering at query time means the restricted text is already in the file, one
 * forgotten `WHERE` clause from being served; refusing at ingest means it was
 * never written, and the refusal is visible to the person running the crawl,
 * who is the one who can fix the source manifest.
 */
export function ingestDocument(
  store: HausIndexStore,
  input: HausIngestInput,
): IngestOutcome {
  if (input.confidentiality !== 'public') {
    throw new ConfidentialDocumentRejected(input.url, input.confidentiality);
  }

  const id = documentId(input.url);
  const hash = contentHash(input.body);
  const existing = store.get(id);
  if (existing && existing.contentHash === hash && existing.status === (input.status ?? 'in-force')) {
    return 'unchanged';
  }

  const record: HausDocumentRecord = {
    id,
    url: input.url,
    title: input.title,
    body: input.body,
    normativeForce: input.normativeForce,
    status: input.status ?? 'in-force',
    confidentiality: input.confidentiality,
    licence: input.licence ?? DEFAULT_RIGHTS.licence,
    redistribution: input.redistribution ?? DEFAULT_RIGHTS.redistribution,
    contentHash: hash,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    ...(input.documentType ? { documentType: input.documentType } : {}),
    ...(input.asOf ? { asOf: input.asOf } : {}),
    ...(input.owner ? { owner: input.owner } : {}),
    ...(input.supersededBy ? { supersededBy: input.supersededBy } : {}),
    ...(input.language ? { language: input.language } : { language: 'de' }),
  };
  store.upsert(record);
  return existing ? 'updated' : 'created';
}
