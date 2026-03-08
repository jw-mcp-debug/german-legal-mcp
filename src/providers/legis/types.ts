export const STATES = [
  'BUND', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH',
] as const;

export type State = (typeof STATES)[number];

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  date: string;
}

export interface LegisEntry {
  title: string;
  content: string;
  url: string;
}

export interface TocEntry {
  depth: number;
  num: string;
  title: string;
}

export interface LegisAdapter {
  readonly states: readonly string[];
  search(state: string, query: string, limit: number): Promise<SearchResult[]>;
  get(state: string, id: string): Promise<LegisEntry>;
  toc?(state: string, id: string): Promise<TocEntry[]>;
}
