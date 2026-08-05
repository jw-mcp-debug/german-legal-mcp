import type { DecisionAdapter, DecisionEntry, DecisionSearchResult } from '../types.js';
import { searchBayern, fetchBayernDecision } from '../bayern/client.js';
import { convertBayernDecision } from '../bayern/converter.js';

interface BayernClient { search(query: string, limit: number): Promise<Array<{ title: string; docId: string; subtitle: string }>>; get(id: string): Promise<string>; }

export class BayernDecisionAdapter implements DecisionAdapter {
  readonly sources = ['BY'] as const;

  constructor(private readonly client: BayernClient = { search: searchBayern, get: fetchBayernDecision }) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    return (await this.client.search(query, limit)).map((r) => ({ id: r.docId, title: r.title, subtitle: r.subtitle, date: '' }));
  }

  async get(_source: string, id: string): Promise<DecisionEntry> {
    const d = convertBayernDecision(await this.client.get(id));
    const content = [d.leitsaetze.length ? `## Leitsätze\n\n${d.leitsaetze.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : '', d.normenketten.length ? `**Normenketten:** ${d.normenketten.join('; ')}` : '', d.fundstelle ? `**Fundstelle:** ${d.fundstelle}` : '', d.content].filter(Boolean).join('\n\n');
    return { title: d.title || d.fileNumber, content, url: `https://www.gesetze-bayern.de/Content/Document/${id}`, court: d.court, date: d.date, fileNumber: d.fileNumber };
  }
}
