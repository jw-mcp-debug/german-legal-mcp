import axios from 'axios';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import type { LegisAdapter, SearchResult, LegisEntry } from '../types.js';

const BASE = 'https://www.transparenz.bremen.de';
const turndown = new TurndownService({ headingStyle: 'atx' });

function docUrl(id: string): string {
  return `${BASE}/sixcms/detail.php?gsid=bremen2014_tp.c.${id}.de&asl=bremen203_tpgesetz.c.55340.de&template=20_gp_ifg_meta_detail_d`;
}

export class BremenAdapter implements LegisAdapter {
  readonly states = ['HB'] as const;

  async search(_state: string, query: string, limit: number): Promise<SearchResult[]> {
    const resp = await axios.get<string>(`${BASE}/sixcms/detail.php`, {
      params: {
        template: '20_search_d',
        'search[send]': 'true',
        'search[vt]': query,
        'search[area]': '18',
        lang: 'de',
      },
    });

    const $ = load(resp.data);
    const results: SearchResult[] = [];
    $('a[href*="metainformationen/"]').each((_, el) => {
      const href = $(el).attr('href')!;
      const text = $(el).text().trim();
      if (!text || text.length < 5 || text.includes('Zur Inhaltsseite') || text.includes('zur News') || results.length >= limit) return;
      const match = href.match(/-(\d+)\?/);
      const id = match?.[1];
      if (id !== undefined && !results.some((r) => r.id === id)) {
        results.push({ id, title: text, subtitle: '', date: '' });
      }
    });
    return results;
  }

  async get(_state: string, id: string): Promise<LegisEntry> {
    const resp = await axios.get<string>(docUrl(id), { maxRedirects: 5 });
    const $ = load(resp.data);

    const title = $('title').text().replace(/\s*-\s*Transparenzportal Bremen$/, '').trim();
    const content = $('.main_article.gesetz');
    content.find('.interfaceicon, .jwsinhaltsverzeichnis, .docLayoutCopyright, .documentHeader, .jgwsHead, .jgwsTitle, script').remove();
    content.find('a[href*="javascript"], a[href*="verschicken"], a[href*="#inhaltsverzeichnis"]').remove();
    // Strip internal anchor links (TOC entries like [§ 1](#jlr-...))
    content.find('a[href^="#jlr-"], a[href^="#P"]').each((_, el) => {
      $(el).replaceWith($(el).text());
    });
    $('h1 br, h2 br, h3 br, h4 br, h5 br').replaceWith(' ');

    const md = turndown.turndown(content.html() || '');
    return { title, content: md, url: resp.request?.res?.responseUrl || docUrl(id) };
  }
}
