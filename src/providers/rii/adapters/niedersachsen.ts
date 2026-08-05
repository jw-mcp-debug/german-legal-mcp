import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { HTTP_USER_AGENT } from '../../../config.js';
import type { DecisionAdapter, DecisionEntry, DecisionPage, DecisionSearchResult } from '../types.js';

const BASE = 'https://voris.wolterskluwer-online.de';
const turndown = new TurndownService({ headingStyle: 'atx' });

/**
 * NI reports counts per facet rather than one overall figure. The search filters
 * to Rechtsprechung, so that facet's own count is the matching total.
 */
export function parseNiedersachsenTotalHits(html: string): number | undefined {
  const match = html.match(/Rechtsprechung Filter\s*(\d+)\s*Ergebnisse/);
  if (!match?.[1]) return undefined;
  const total = Number.parseInt(match[1], 10);
  return Number.isNaN(total) ? undefined : total;
}

export class NiedersachsenDecisionAdapter implements DecisionAdapter {
  readonly sources = ['NI'] as const;

  constructor(private readonly http: Pick<AxiosInstance, 'get'> = axios) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    return (await this.searchPage(_source, query, limit)).results;
  }

  async searchPage(_source: string, query: string, limit: number, page = 1): Promise<DecisionPage> {
    const response = await this.http.get<string>(`${BASE}/search`, {
      params: { query, pit: 'in_force', publicationtype: 'publicationform-ats-filter!ATS_Rechtsprechung', ...(page > 1 ? { page: String(page) } : {}) },
      headers: { 'User-Agent': HTTP_USER_AGENT },
    });
    const $ = cheerio.load(response.data);
    const results = $('.egal-search-result-item-title h3 a[href^="/browse/document/"]').slice(0, limit).map((_, el) => {
      const item = $(el).closest('.views-row, .egal-search-result-item');
      const extra = item.find('.egal-search-result-item-extra').text().replace(/\s+/g, ' ').trim();
      const date = extra.match(/Entscheidungsdatum:\s*([\d.]+)/)?.[1] || '';
      const title = $(el).text().replace(/\s+/g, ' ').trim();
      const court = title.match(/^([^,]+),/)?.[1];
      return { id: $(el).attr('href')?.split('/').pop() || '', title, subtitle: item.find('.egal-search-result-item-snippet').text().replace(/\s+/g, ' ').trim(), date, ...(court ? { court } : {}) };
    }).get();
    const totalHits = parseNiedersachsenTotalHits(response.data);
    return { results, ...(totalHits === undefined ? {} : { totalHits }) };
  }

  async get(_source: string, id: string): Promise<DecisionEntry> {
    const url = `${BASE}/browse/document/${id}`;
    const response = await this.http.get<string>(url, { headers: { 'User-Agent': HTTP_USER_AGENT } });
    const $ = cheerio.load(response.data);
    const title = $('.wkde-doctitle, h1').first().text().replace(/\s+/g, ' ').trim()
      || $('title').text().replace(/\s*\|.*$/, '').trim();
    const metadata: Record<string, string> = {};
    $('.wkde-bibliography dt').each((_, el) => {
      const label = $(el).text().replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');
      const value = $(el).next('dd').text().replace(/\s+/g, ' ').trim();
      if (label && value) metadata[label] = value;
    });
    $('.views-field, .field').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      for (const label of ['Gericht', 'Entscheidungsdatum', 'Aktenzeichen', 'ECLI']) {
        const value = text.match(new RegExp(`${label}:?\\s*(.+)$`, 'i'))?.[1];
        if (value) metadata[label.toLowerCase()] = value;
      }
    });
    const body = $('.wkde-document-body');
    body.find('.law-toc, nav, [role="navigation"], .wkde-document-tools').remove();
    body.find('a.internal-cite').each((_, el) => { $(el).replaceWith($(el).text()); });
    const content = turndown.turndown(body.html() || '');
    return {
      title,
      content,
      url,
      court: metadata.gericht || '',
      date: metadata.entscheidungsdatum || metadata.datum || '',
      fileNumber: metadata.aktenzeichen || '',
      ...(metadata.ecli ? { ecli: metadata.ecli } : {}),
    };
  }
}
