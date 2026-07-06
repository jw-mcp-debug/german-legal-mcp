import axios from 'axios';
import { load } from 'cheerio';
import TurndownService from 'turndown';
import type { LegisAdapter, SearchResult, LegisEntry, TocEntry } from '../types.js';

const BASE = 'https://recht.nrw.de';
const SEARCH = `${BASE}/search-middleware/opensearch_internet/_search`;
const turndown = new TurndownService({ headingStyle: 'atx' });

interface SearchHit {
  _id?: string;
  _source?: {
    url?: string[];
    field_abbreviation?: string[];
    field_long_title?: string[];
    field_document_type_name?: string[];
  };
}

interface SearchResponse {
  hits?: {
    hits?: SearchHit[];
  };
}

function nodeId(id: string): string {
  return `entity:node/${id}:de`;
}

async function resolveUrl(id: string): Promise<string> {
  // Numeric ID → look up URL slug via OpenSearch
  if (/^\d+$/.test(id)) {
    const resp = await axios.post<SearchResponse>(SEARCH, {
      query: { term: { _id: nodeId(id) } }, size: 1, _source: ['url'],
    });
    const url = resp.data.hits?.hits?.[0]?._source?.url?.[0];
    if (!url) throw new Error(`NW law not found: ${id}`);
    return url;
  }
  return `/lrgv/${id}`;
}

export class NRWAdapter implements LegisAdapter {
  readonly states = ['NW'] as const;

  async search(_state: string, query: string, limit: number): Promise<SearchResult[]> {
    const resp = await axios.post<SearchResponse>(SEARCH, {
      query: {
        bool: {
          must: [{ query_string: { query, default_operator: 'AND' } }],
          filter: [
            { term: { field_historically: false } },
            { term: { type: 'state_law_and_regulations' } },
          ],
        },
      },
      size: limit,
      _source: ['url', 'field_abbreviation', 'field_long_title', 'field_document_type_name'],
    });

    return ((resp.data.hits?.hits || []) as SearchHit[]).map((h) => {
      const s = h._source ?? {};
      const nid = h._id?.match(/node\/(\d+)/)?.[1] || '';
      return {
        id: nid,
        title: s.field_long_title?.[0] || '',
        subtitle: s.field_abbreviation?.[0] || '',
        date: s.field_document_type_name?.[0] || '',
      };
    });
  }

  async get(_state: string, id: string): Promise<LegisEntry> {
    const path = await resolveUrl(id);
    const url = `${BASE}${path}`;
    const resp = await axios.get<string>(url, { maxRedirects: 5 });
    const $ = load(resp.data);

    const title = $('title').text().replace(/\s*\|\s*RECHT\.NRW\.DE$/, '').replace(/^\d{2}\.\d{2}\.\d{4}\s+/, '').trim();

    // Remove navigation, alerts, TOC, toolbars
    $('.alert, .footnote-container, .dropdown, .back-to-text-top, .print-title, nav, .toc-sidebar, .search-in-text, .toolbar').remove();

    const paragraphs = $('.paragraph--type--article');
    paragraphs.find('.paragraph-header a, .article-print').remove();
    paragraphs.first().find('table').remove(); // Inhaltsübersicht
    paragraphs.find('a[href^="/gvnrw"], a[href^="/lrgv"]').each((_, el) => { $(el).replaceWith($(el).text()); });
    paragraphs.find('h1 br, h2 br, h3 br, h4 br, h5 br').replaceWith(' ');

    const parts: string[] = [];
    paragraphs.each((_, el) => { parts.push($.html(el)); });
    const md = turndown.turndown(parts.join('\n'));
    return { title, content: md, url: resp.request?.res?.responseUrl || url };
  }

  async toc(_state: string, id: string): Promise<TocEntry[]> {
    const query = /^\d+$/.test(id)
      ? { term: { _id: nodeId(id) } }
      : { bool: { filter: [{ term: { url: `/lrgv/${id}` } }] } };
    const resp = await axios.post<{
      hits?: {
        hits?: Array<{
          _source?: {
            field_body_field_num?: string[];
            field_body_field_headline?: string[];
          };
        }>;
      };
    }>(SEARCH, {
      query, size: 1, _source: ['field_body_field_num', 'field_body_field_headline'],
    });

    const hit = resp.data.hits?.hits?.[0]?._source;
    if (!hit) throw new Error(`Law not found: ${id}`);

    const nums: string[] = hit.field_body_field_num || [];
    const heads: string[] = hit.field_body_field_headline || [];
    return nums.map((num, i) => ({ depth: 1, num, title: heads[i] || '' }));
  }
}
