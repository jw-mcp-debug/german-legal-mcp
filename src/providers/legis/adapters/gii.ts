import { HTTP_USER_AGENT } from '../../../config.js';
import { giiGetLegislation } from '../../../shared/clients/gii.js';
import type { LegisAdapter, SearchResult, LegisEntry, TocEntry } from '../types.js';
import axios from 'axios';
import { load } from 'cheerio';

const BASE_URL = 'https://www.gesetze-im-internet.de';

// Depth by structural keyword
const STRUCT_DEPTH: Record<string, number> = {
  Buch: 0, Teil: 0,
  Abschnitt: 1, Kapitel: 1,
  Titel: 2, Untertitel: 2, Unterkapitel: 2,
};

export class GiiAdapter implements LegisAdapter {
  readonly states = ['BUND'] as const;

  async search(_state: string, _query: string, _limit: number): Promise<SearchResult[]> {
    throw new Error(
      'BUND does not support search. Use legis:get with id "law/section" (e.g. "bgb/823").',
    );
  }

  async get(_state: string, id: string): Promise<LegisEntry> {
    const slashIndex = id.indexOf('/');
    if (slashIndex === -1) {
      throw new Error('BUND id must be "law/section" (e.g. "bgb/823", "gg/Art. 1")');
    }

    const law = id.substring(0, slashIndex);
    const section = id.substring(slashIndex + 1);
    const result = await giiGetLegislation(law, section);

    return {
      title: result.title,
      content: result.content,
      url: result.url,
    };
  }

  async toc(_state: string, id: string): Promise<TocEntry[]> {
    const law = id.toLowerCase();
    const resp = await axios.get(`${BASE_URL}/${law}/index.html`, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': HTTP_USER_AGENT },
    });
    const html = Buffer.from(resp.data).toString('latin1');
    const $ = load(html);

    const entries: TocEntry[] = [];
    let pendingStruct: string | null = null;
    let lastStructDepth = 0;

    $('#paddingLR12 a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (!text || text.length < 2) return;

      if (href.includes('BJNG')) {
        const kwMatch = text.match(/\b(Buch|Abschnitt|Kapitel)\b/) || text.match(/\b(Titel|Untertitel|Unterkapitel)\b(?!.*nahme)/) || text.match(/\bTeil\b$/);
        const isRoman = /^[IVX]+\.?\s*$/.test(text);
        if (kwMatch || isRoman) {
          if (pendingStruct) {
            entries.push({ depth: lastStructDepth, num: '', title: pendingStruct });
          }
          pendingStruct = text;
        } else if (pendingStruct) {
          const kw = pendingStruct.match(/\b(Buch|Abschnitt|Kapitel|Titel|Untertitel|Unterkapitel)\b/);
          lastStructDepth = kw?.[1] ? (STRUCT_DEPTH[kw[1]] ?? 1) : 1;
          entries.push({ depth: lastStructDepth, num: pendingStruct, title: text });
          pendingStruct = null;
        } else {
          entries.push({ depth: lastStructDepth + 1, num: '', title: text });
        }
      } else if (href.includes('__') || href.includes('art_')) {
        if (pendingStruct) { pendingStruct = null; }
        const m = text.match(/^(§§?\s*\S+|Art\.?\s*\S+)\s+(.*)/);
        entries.push({ depth: 3, num: m?.[1] || text, title: m?.[2] || '' });
      }
    });

    return entries;
  }
}
