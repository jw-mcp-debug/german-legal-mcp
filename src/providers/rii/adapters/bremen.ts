import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { HTTP_USER_AGENT } from '../../../config.js';
import type { DecisionAdapter, DecisionEntry, DecisionSearchResult } from '../types.js';

const OVERVIEW = 'https://www.verwaltungsgericht.bremen.de/entscheidungen/entscheidungsuebersicht-13039';
const turndown = new TurndownService({ headingStyle: 'atx' });

/** Bremen has no state-wide search API; the official index currently exposes the VG archive. */
export class BremenDecisionAdapter implements DecisionAdapter {
  readonly sources = ['HB'] as const;
  constructor(private readonly http: Pick<AxiosInstance, 'get'> = axios) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    const response = await this.http.get<string>(OVERVIEW, { headers: { 'User-Agent': HTTP_USER_AGENT } });
    const $ = cheerio.load(response.data);
    const needle = query.toLocaleLowerCase('de-DE');
    return $('tr.search-result').map((_, row) => {
      const cells = $(row).find('td');
      const date = cells.eq(0).find('em').text().trim();
      const text = cells.eq(1).text().replace(/\s+/g, ' ').trim();
      const link = cells.eq(1).find('a[title]').last();
      const title = link.attr('title')?.replace(/,?\s*(Urteil|Beschluss) vom\s+[\d.]+$/, '').trim() || text;
      const href = link.attr('href');
      const url = href ? new URL(href, OVERVIEW).toString() : '';
      return { id: url, title, subtitle: text, date, court: 'Verwaltungsgericht Bremen', url };
    }).get().filter((result) => !needle || `${result.title} ${result.subtitle}`.toLocaleLowerCase('de-DE').includes(needle)).slice(0, limit);
  }

  async get(_source: string, id: string): Promise<DecisionEntry> {
    const url = id.startsWith('http') ? id : new URL(id, OVERVIEW).toString();
    const response = await this.http.get<string>(url, { headers: { 'User-Agent': HTTP_USER_AGENT } });
    const $ = cheerio.load(response.data);
    const root = $('.main_article, main, article').first();
    const title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().trim();
    root.find('nav, script, style, form, .breadcrumb, .socialmedia').remove();
    const metadata = root.text().replace(/\s+/g, ' ');
    return { title, content: turndown.turndown(root.html() || ''), url, court: 'Verwaltungsgericht Bremen', date: metadata.match(/(?:vom|am)\s+(\d{2}\.\d{2}\.\d{4})/)?.[1] || '', fileNumber: metadata.match(/\b\d+\s+[VK]\s+\d+\/\d+\b/)?.[0] || '' };
  }
}
