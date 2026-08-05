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

export interface DecisionAdapter {
  readonly sources: readonly string[];
  search(source: string, query: string, limit: number): Promise<DecisionSearchResult[]>;
  get(source: string, id: string, options?: DecisionGetOptions): Promise<DecisionEntry>;
}

export interface DecisionSourceFailure {
  source: string;
  error: unknown;
}

export interface DecisionSearchBatch {
  results: SourcedDecisionSearchResult[];
  failures: DecisionSourceFailure[];
}
