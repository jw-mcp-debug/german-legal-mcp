import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  Confidentiality,
  DocumentAuthority,
  DocumentStatus,
  NormativeForce,
} from '../../contracts/legal-resource.js';

/**
 * A row as the index holds it — flat, because it crosses the SQLite boundary.
 * `HausDataClient` maps this onto `AdministrativeGuidanceReference`; nothing
 * outside this module should see the snake_case column names.
 */
export interface HausDocumentRecord {
  readonly id: string;
  /** Which corpus this came from — 'opus4-bht', 'web', … */
  readonly sourceId: string;
  readonly url: string;
  readonly title: string;
  readonly documentType?: string;
  readonly normativeForce: NormativeForce;
  readonly status: DocumentStatus;
  readonly confidentiality: Confidentiality;
  readonly authority: DocumentAuthority;
  readonly authoritativeSource?: string;
  readonly asOf?: string;
  readonly owner?: string;
  readonly supersededBy?: string;
  readonly language?: string;
  readonly licence: string;
  readonly redistribution: string;
  readonly contentHash: string;
  readonly retrievedAt: string;
  readonly body: string;
}

export interface HausSearchFilters {
  readonly sourceId?: string;
  readonly documentType?: string;
  readonly owner?: string;
  readonly normativeForce?: NormativeForce;
  /** Off by default: a superseded Handreichung answering a live question is the
   *  failure mode this index exists to avoid. */
  readonly includeOutdated?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface HausSearchRow extends HausDocumentRecord {
  /** BM25 score; lower is a better match, as SQLite reports it. */
  readonly rank: number;
  /** Highlighted excerpt around the best match. */
  readonly snippet: string;
}

export interface HausCoverageRow {
  readonly sourceId: string;
  readonly documentType: string;
  readonly owner: string;
  readonly count: number;
  readonly oldestAsOf?: string;
  readonly newestAsOf?: string;
}

/**
 * Stable identity for a document, derived from its canonical URL.
 *
 * Deliberately not the crawl order or a row id: a re-crawl has to recognise the
 * document it saw last time, and the URL is the only thing a published source
 * guarantees to keep. A changed URL is a new document, which is the correct
 * reading — the old one is then reported as vanished rather than silently
 * carried forward under new text.
 */
export function documentId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function contentHash(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * FTS5 reads its own query syntax, and a Verwaltung question is full of the
 * characters that syntax reserves — `§`, `-`, `:`, `(`. Passing user text
 * through raw turns "Az. 4-2/17" into a syntax error, so every token is quoted
 * and the terms are ANDed, which is FTS5's own default between quoted phrases.
 */
function toMatchExpression(query: string): string {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '').trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return '';
  return tokens.map((token) => `"${token}"`).join(' ');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id             TEXT PRIMARY KEY,
  source_id      TEXT NOT NULL DEFAULT 'web',
  url            TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  document_type  TEXT,
  normative_force TEXT NOT NULL,
  status         TEXT NOT NULL,
  confidentiality TEXT NOT NULL,
  authority      TEXT NOT NULL DEFAULT 'reading-version',
  authoritative_source TEXT,
  as_of          TEXT,
  owner          TEXT,
  superseded_by  TEXT,
  language       TEXT,
  licence        TEXT NOT NULL,
  redistribution TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  retrieved_at   TEXT NOT NULL,
  body           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS documents_source ON documents(source_id);
CREATE INDEX IF NOT EXISTS documents_retrieved ON documents(retrieved_at);

-- unicode61 folds the umlauts a German corpus is full of; there is no German
-- stemmer in FTS5, so "Lizenzvertrag" does not match "Lizenzverträge" and a
-- caller is told as much in the tool description rather than left guessing.
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;

/**
 * The local full-text index over published house documents.
 *
 * SQLite with FTS5, through Node's own `node:sqlite` — no dependency, no
 * service, no data leaving the machine. BM25 over lexical tokens is also the
 * right retrieval model for this corpus specifically: administrative German is
 * dense with identifiers (Aktenzeichen, §-Verweise, supplier and product
 * names) that embeddings blur and exact matching finds.
 */
export class HausIndexStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  /**
   * `CREATE TABLE IF NOT EXISTS` is a no-op against an index built by an
   * earlier version, so a column added later never appears and every read of
   * it fails at runtime. Adding it here keeps an existing local index usable
   * instead of requiring a re-crawl.
   */
  private migrate(): void {
    const columns = this.db.prepare('PRAGMA table_info(documents)').all()
      .map((row) => String(row.name));
    if (!columns.includes('source_id')) {
      this.db.exec(`ALTER TABLE documents ADD COLUMN source_id TEXT NOT NULL DEFAULT 'web'`);
      this.db.exec('CREATE INDEX IF NOT EXISTS documents_source ON documents(source_id)');
    }
    if (!columns.includes('authority')) {
      this.db.exec(`ALTER TABLE documents ADD COLUMN authority TEXT NOT NULL DEFAULT 'reading-version'`);
      this.db.exec('ALTER TABLE documents ADD COLUMN authoritative_source TEXT');
    }
  }

  upsert(record: HausDocumentRecord): void {
    this.db.prepare(`
      INSERT INTO documents (
        id, source_id, url, title, document_type, normative_force, status,
        confidentiality, authority, authoritative_source, as_of, owner,
        superseded_by, language, licence, redistribution, content_hash,
        retrieved_at, body
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        source_id = excluded.source_id,
        url = excluded.url, title = excluded.title,
        document_type = excluded.document_type,
        normative_force = excluded.normative_force,
        status = excluded.status, confidentiality = excluded.confidentiality,
        authority = excluded.authority,
        authoritative_source = excluded.authoritative_source,
        as_of = excluded.as_of, owner = excluded.owner,
        superseded_by = excluded.superseded_by, language = excluded.language,
        licence = excluded.licence, redistribution = excluded.redistribution,
        content_hash = excluded.content_hash,
        retrieved_at = excluded.retrieved_at, body = excluded.body
    `).run(
      record.id, record.sourceId, record.url, record.title, record.documentType ?? null,
      record.normativeForce, record.status, record.confidentiality,
      record.authority, record.authoritativeSource ?? null,
      record.asOf ?? null, record.owner ?? null, record.supersededBy ?? null,
      record.language ?? null, record.licence, record.redistribution,
      record.contentHash, record.retrievedAt, record.body,
    );
    this.db.prepare('DELETE FROM documents_fts WHERE id = ?').run(record.id);
    this.db.prepare('INSERT INTO documents_fts (id, title, body) VALUES (?,?,?)')
      .run(record.id, record.title, record.body);
  }

  /**
   * Record that a source stopped answering, without discarding what it said.
   *
   * Deleting would make the document indistinguishable from one that was never
   * indexed, and a caller asking about it would get "nothing found" — the one
   * answer a withdrawn rule must never produce.
   */
  markStatus(id: string, status: DocumentStatus): void {
    this.db.prepare('UPDATE documents SET status = ? WHERE id = ?').run(status, id);
  }

  get(id: string): HausDocumentRecord | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    return row ? toRecord(row) : null;
  }

  getByUrl(url: string): HausDocumentRecord | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE url = ?').get(url);
    return row ? toRecord(row) : null;
  }

  search(query: string, filters: HausSearchFilters = {}): HausSearchRow[] {
    const match = toMatchExpression(query);
    if (match === '') return [];
    const conditions: string[] = ['documents_fts MATCH ?'];
    const params: (string | number)[] = [match];
    if (!filters.includeOutdated) conditions.push(`d.status = 'in-force'`);
    if (filters.sourceId) { conditions.push('d.source_id = ?'); params.push(filters.sourceId); }
    if (filters.documentType) { conditions.push('d.document_type = ?'); params.push(filters.documentType); }
    if (filters.owner) { conditions.push('d.owner = ?'); params.push(filters.owner); }
    if (filters.normativeForce) { conditions.push('d.normative_force = ?'); params.push(filters.normativeForce); }
    params.push(filters.limit ?? 10, filters.offset ?? 0);

    const rows = this.db.prepare(`
      SELECT d.*, bm25(documents_fts, 4.0, 1.0) AS rank,
             snippet(documents_fts, 2, '«', '»', '…', 24) AS snippet
      FROM documents_fts
      JOIN documents d ON d.id = documents_fts.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `).all(...params);

    return rows.map((row) => ({
      ...toRecord(row),
      rank: Number(row.rank),
      snippet: String(row.snippet ?? ''),
    }));
  }

  count(includeOutdated = false): number {
    const sql = includeOutdated
      ? 'SELECT COUNT(*) AS n FROM documents'
      : `SELECT COUNT(*) AS n FROM documents WHERE status = 'in-force'`;
    return Number(this.db.prepare(sql).get()?.n ?? 0);
  }

  /** What the corpus actually holds — so "no hits" can be told apart from "not covered". */
  coverage(): HausCoverageRow[] {
    const rows = this.db.prepare(`
      SELECT source_id,
             COALESCE(document_type, 'ohne Typ') AS document_type,
             COALESCE(owner, 'ohne Zuständigkeit') AS owner,
             COUNT(*) AS n, MIN(as_of) AS oldest, MAX(as_of) AS newest
      FROM documents WHERE status = 'in-force'
      GROUP BY source_id, document_type, owner
      ORDER BY n DESC
    `).all();
    return rows.map((row) => ({
      sourceId: String(row.source_id),
      documentType: String(row.document_type),
      owner: String(row.owner),
      count: Number(row.n),
      ...(row.oldest ? { oldestAsOf: String(row.oldest) } : {}),
      ...(row.newest ? { newestAsOf: String(row.newest) } : {}),
    }));
  }

  /** Documents whose stated Stand is older than the cut-off, oldest first. */
  stale(beforeIso: string, limit = 50): HausDocumentRecord[] {
    return this.db.prepare(`
      SELECT * FROM documents
      WHERE status = 'in-force' AND (as_of IS NULL OR as_of < ?)
      -- Dated documents oldest first; the undated ones trail them, because
      -- "no Stand at all" is a different defect needing a different fix, and
      -- putting it first would bury the documents that are provably old.
      ORDER BY as_of IS NULL, as_of
      LIMIT ?
    `).all(beforeIso, limit).map(toRecord);
  }

  /**
   * Walk the corpus rather than question it. `since` filters on `retrieved_at`,
   * which is the only date every row is guaranteed to carry — a document's own
   * Stand is frequently absent, and ordering a delta by a field two thirds of
   * the corpus leaves null would silently drop those rows from every run.
   */
  enumerate(since?: string, limit = 100, offset = 0): HausDocumentRecord[] {
    const where = since ? 'WHERE retrieved_at >= ?' : '';
    const params: (string | number)[] = since ? [since, limit, offset] : [limit, offset];
    return this.db.prepare(`
      SELECT * FROM documents ${where} ORDER BY retrieved_at, id LIMIT ? OFFSET ?
    `).all(...params).map(toRecord);
  }
}

function optional(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function toRecord(row: Record<string, unknown>): HausDocumentRecord {
  const documentType = optional(row.document_type);
  const asOf = optional(row.as_of);
  const owner = optional(row.owner);
  const supersededBy = optional(row.superseded_by);
  const authoritativeSource = optional(row.authoritative_source);
  const language = optional(row.language);
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    url: String(row.url),
    title: String(row.title),
    normativeForce: String(row.normative_force) as NormativeForce,
    status: String(row.status) as DocumentStatus,
    confidentiality: String(row.confidentiality) as Confidentiality,
    authority: String(row.authority) as DocumentAuthority,
    licence: String(row.licence),
    redistribution: String(row.redistribution),
    contentHash: String(row.content_hash),
    retrievedAt: String(row.retrieved_at),
    body: String(row.body),
    ...(documentType ? { documentType } : {}),
    ...(asOf ? { asOf } : {}),
    ...(owner ? { owner } : {}),
    ...(supersededBy ? { supersededBy } : {}),
    ...(authoritativeSource ? { authoritativeSource } : {}),
    ...(language ? { language } : {}),
  };
}
