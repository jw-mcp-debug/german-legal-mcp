/** Normalized case-law contract shared by all RII sources. */
export interface DecisionSearchResult {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  court?: string;
  fileNumber?: string;
  ecli?: string;
  snippet?: string;
  url?: string;
}

export interface SourcedDecisionSearchResult extends DecisionSearchResult {
  source: string;
}

export interface DecisionEntry {
  title: string;
  content: string;
  url: string;
  court: string;
  date: string;
  fileNumber: string;
  ecli?: string;
  headnotes?: string[];
  norms?: string[];
}

export interface DecisionGetOptions {
  part?: string;
}

/** A page of results plus the upstream total, where the source publishes one. */
export interface DecisionPage {
  results: DecisionSearchResult[];
  totalHits?: number;
  /**
   * Set when the source cannot reach the requested page. Callers surface this
   * rather than silently returning page one again, which would duplicate rows
   * already shown.
   */
  pagingUnsupported?: boolean;
}

export interface DecisionAdapter {
  readonly sources: readonly string[];
  search(source: string, query: string, limit: number): Promise<DecisionSearchResult[]>;
  /**
   * The same search, additionally reporting the source's own hit total.
   *
   * Optional by design: an adapter whose upstream never states a total just
   * doesn't implement it and the client falls back to `search`. That keeps
   * "how many are there really?" from becoming a field every adapter has to
   * fake.
   */
  searchPage?(source: string, query: string, limit: number, page?: number): Promise<DecisionPage>;
  get(source: string, id: string, options?: DecisionGetOptions): Promise<DecisionEntry>;
}

export interface DecisionSourceFailure {
  source: string;
  error: unknown;
}

export interface DecisionSearchBatch {
  results: SourcedDecisionSearchResult[];
  failures: DecisionSourceFailure[];
  /** Upstream totals by source, for those that report one. */
  totals?: Record<string, number>;
  /** Sources that could not reach the requested page. */
  unpaged?: string[];
}
