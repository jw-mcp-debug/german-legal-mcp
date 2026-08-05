import type { DecisionAdapter, DecisionEntry, DecisionPage, DecisionSearchResult } from '../types.js';
import { searchBayern, fetchBayernDecision } from '../bayern/client.js';
import { convertBayernDecision } from '../bayern/converter.js';

interface BayernClient { search(query: string, limit: number, page?: number): Promise<{ results: Array<{ title: string; docId: string; subtitle: string }>; totalHits?: number }>; get(id: string): Promise<string>; }

export class BayernDecisionAdapter implements DecisionAdapter {
  readonly sources = ['BY'] as const;

  constructor(private readonly client: BayernClient = { search: searchBayern, get: fetchBayernDecision }) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    return (await this.searchPage(_source, query, limit)).results;
  }

  async searchPage(_source: string, query: string, limit: number, page = 1): Promise<DecisionPage> {
    const fetched = await this.client.search(query, limit, page);
    return {
      results: fetched.results.map((r) => ({ id: r.docId, title: r.title, subtitle: r.subtitle, date: '' })),
      ...(fetched.totalHits === undefined ? {} : { totalHits: fetched.totalHits }),
    };
  }

  async get(_source: string, id: string): Promise<DecisionEntry> {
    const d = convertBayernDecision(await this.client.get(id));
    const content = [d.leitsaetze.length ? `## Leitsätze\n\n${d.leitsaetze.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : '', d.normenketten.length ? `**Normenketten:** ${d.normenketten.join('; ')}` : '', d.fundstelle ? `**Fundstelle:** ${d.fundstelle}` : '', d.content].filter(Boolean).join('\n\n');
    return { title: d.title || d.fileNumber, content, url: `https://www.gesetze-bayern.de/Content/Document/${id}`, court: d.court, date: d.date, fileNumber: d.fileNumber };
  }
}
