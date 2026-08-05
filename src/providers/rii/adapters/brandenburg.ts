import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { HTTP_USER_AGENT } from '../../../config.js';
import type { DecisionAdapter, DecisionEntry, DecisionSearchResult } from '../types.js';

const BASE = 'https://gerichtsentscheidungen.brandenburg.de';
const turndown = new TurndownService({ headingStyle: 'atx' });

export class BrandenburgDecisionAdapter implements DecisionAdapter {
  readonly sources = ['BB'] as const;

  constructor(private readonly http: Pick<AxiosInstance, 'get'> = axios) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    const response = await this.http.get<string>(`${BASE}/suche`, { params: { input_fulltext: query }, headers: { 'User-Agent': HTTP_USER_AGENT } });
    const $ = cheerio.load(response.data);
    return $('#resultlist tbody tr').slice(0, limit).map((_, el) => {
      const cells = $(el).find('td');
      const link = cells.eq(3).find('a');
      return { id: link.attr('href')?.split('/').pop() || '', title: link.text().replace(/\s+/g, ' ').trim(), subtitle: `${cells.eq(1).text().trim()} | ${cells.eq(4).text().replace(/\s+/g, ' ').trim()}`, date: cells.eq(2).text().trim(), court: cells.eq(4).text().replace(/\s+/g, ' ').trim() };
    }).get();
  }

  async get(_source: string, id: string): Promise<DecisionEntry> {
    const url = `${BASE}/gerichtsentscheidung/${id}`;
    const response = await this.http.get<string>(url, { headers: { 'User-Agent': HTTP_USER_AGENT } });
    const $ = cheerio.load(response.data);
    const metadata: Record<string, string> = {};
    $('#metadata th').each((_, el) => { metadata[$(el).text().replace(/\s+/g, ' ').trim().toLowerCase()] = $(el).next('td').text().replace(/\s+/g, ' ').trim(); });
    const title = $('#metadata h1#header').text().replace(/\s+/g, ' ').trim();
    const contentRoot = $('#gerichtsentscheidung-detail');
    contentRoot.find('nav, script, style, .bb-link-bar, .bb-breadcrumbs').remove();
    const content = turndown.turndown(contentRoot.html() || '');
    return { title, content, url, court: metadata.gericht || '', date: metadata.entscheidungsdatum || '', fileNumber: metadata.aktenzeichen || '', ...(metadata.ecli ? { ecli: metadata.ecli } : {}) };
  }
}
