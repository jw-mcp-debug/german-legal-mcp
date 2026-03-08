import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import {
  jportalSearch,
  jportalGetDocument,
  JPORTAL_STATES,
} from '../../../shared/clients/jportal.js';
import type { LegisAdapter, SearchResult, LegisEntry } from '../types.js';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

function extractMetadata(headHtml: string): string {
  const $ = cheerio.load(headHtml);
  const pairs: string[] = [];
  $('th').each((_, th) => {
    const key = $(th).text().trim().replace(/:$/, '');
    const val = $(th).next('td').text().trim();
    if (key && val) pairs.push(`**${key}:** ${val}`);
  });
  return pairs.join('  \n');
}

export class JPortalAdapter implements LegisAdapter {
  readonly states = JPORTAL_STATES;

  async search(state: string, query: string, limit: number): Promise<SearchResult[]> {
    const results = await jportalSearch(state, query, limit);
    return results.map((r) => ({
      id: r.docId,
      title: r.title,
      subtitle: r.subtitle,
      date: r.date,
    }));
  }

  async get(state: string, id: string): Promise<LegisEntry> {
    const doc = await jportalGetDocument(state, id);

    const metadata = extractMetadata(doc.head);
    const $ = cheerio.load(doc.text);
    // Remove internal navigation anchors and empty tags
    $('a[name]').not('[href]').remove();
    $('comment, .docLayoutNavigation').remove();
    $('h1 br, h2 br, h3 br, h4 br').replaceWith(' ');
    const content = turndown.turndown($.html() || '');

    return {
      title: doc.title,
      content: metadata ? `${metadata}\n\n---\n\n${content}` : content,
      url: doc.permalink,
    };
  }
}
