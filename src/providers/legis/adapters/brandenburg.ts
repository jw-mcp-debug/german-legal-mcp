import axios from 'axios';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import type { LegisAdapter, SearchResult, LegisEntry } from '../types.js';

const BASE = 'https://bravors.brandenburg.de';
const turndown = new TurndownService({ headingStyle: 'atx' });

export class BrandenburgAdapter implements LegisAdapter {
  readonly states = ['BB'] as const;

  async search(_state: string, query: string, limit: number): Promise<SearchResult[]> {
    const page = await axios.get(`${BASE}/de/vorschriften_schnellsuche`);
    const cookies = page.headers['set-cookie']?.map((c: string) => c.split(';')[0]).join('; ');

    const resp = await axios.post<string>(
      `${BASE}/de/vorschriften_schnellsuche`,
      `search%5Bsearchterm%5D=${encodeURIComponent(query)}&search%5Bart_vorschrift%5D=alle&suchen=Suchen`,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookies || '' },
        maxRedirects: 5,
      },
    );

    const $ = load(resp.data);
    const results: SearchResult[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')!;
      if (
        results.length < limit &&
        (href.startsWith('/gesetze/') || href.startsWith('/verordnungen/') || href.startsWith('/verwaltungsvorschriften/')) &&
        !href.includes('/list')
      ) {
        const id = href.replace(/^\//, '');
        if (!results.some((r) => r.id === id)) {
          results.push({ id, title: $(el).text().trim(), subtitle: '', date: '' });
        }
      }
    });
    return results;
  }

  async get(_state: string, id: string): Promise<LegisEntry> {
    const resp = await axios.get<string>(`${BASE}/${id}`);
    const $ = load(resp.data);

    const title = $('title').text().trim();
    $('.helpbox, #help_box, .reiter_gruppe, .partizipations_plugin, .services, .nav2_inner, .br2_inner_index').remove();
    $('h1 br, h2 br, h3 br, h4 br').replaceWith(' ');

    const content = turndown.turndown($('.reiterbox_innen_2').html() || '');
    return { title, content, url: `${BASE}/${id}` };
  }
}
