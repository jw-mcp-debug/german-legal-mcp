import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { HTTP_USER_AGENT } from '../../../config.js';
import type { DecisionAdapter, DecisionEntry, DecisionPage, DecisionSearchResult } from '../types.js';

const URL = 'https://www.justiz.sachsen.de/esamosplus/pages/suchen.aspx';
const turndown = new TurndownService({ headingStyle: 'atx' });
type Http = Pick<AxiosInstance, 'get' | 'post'>;
type HitId = { query: string; name: string; value: string };
type SubmitResult = { html: string; fallback: boolean };
const encode = (hit: HitId) => Buffer.from(JSON.stringify(hit), 'utf8').toString('base64url');
const decode = (id: string): HitId => JSON.parse(Buffer.from(id, 'base64url').toString('utf8')) as HitId;

export class SachsenDecisionAdapter implements DecisionAdapter {
  readonly sources = ['SN'] as const;
  constructor(private readonly http: Http = axios) {}

  private formFields(html: string): URLSearchParams {
    const $ = cheerio.load(html); const form = new URLSearchParams();
    $('form#SlForm input, form#SlForm select').each((_, el) => {
      const name = $(el).attr('name'); const type = ($(el).attr('type') || '').toLowerCase();
      if (!name || type === 'submit' || type === 'button' || type === 'checkbox') return;
      if ($(el).is('select')) form.set(name, $(el).find('option[selected]').attr('value') || '-1');
      else form.set(name, $(el).attr('value') || '');
    });
    return form;
  }

  private async submit(query: string, extra?: { name: string; value: string }): Promise<SubmitResult> {
    const initial = await this.http.get<string>(URL, { timeout: 15000, headers: { 'User-Agent': HTTP_USER_AGENT } });
    // The landing page already contains the current decisions. Posting an empty
    // search can produce an empty result page on the live WebForms endpoint.
    if (!extra && query.trim() === '') return { html: initial.data, fallback: true };
    const form = this.formFields(initial.data);
    form.set('DV1_C33', 'Oberlandesgericht Dresden'); form.set('DV1_C34', ''); form.set('DV1_C35', ''); form.set('DV1_C36', ''); form.set('DV1_C37', query); form.set('DV1_C38', '-1'); form.set('DV1_C39', '-1'); form.set('DV1_C48', 'on');
    if (extra) { form.set(extra.name, extra.value); } else { form.set('DV1_C24', 'Suchen'); }
    const setCookie = initial.headers?.['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie.map((value: string) => value.split(';', 1)[0]).join('; ') : undefined;
    try {
      const response = await this.http.post<string>(URL, form.toString(), { timeout: 15000, headers: { 'User-Agent': HTTP_USER_AGENT, Referer: URL, 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) } });
      return { html: response.data, fallback: false };
    } catch {
      return { html: initial.data, fallback: true };
    }
  }

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    return (await this.searchPage(_source, query, limit)).results;
  }

  /**
   * First page only. The result grid is an ASP.NET WebForms control driven by
   * `__doPostBack` targets that are only rendered once a search has succeeded,
   * and the upstream search endpoint has been answering 504 — so a pager
   * cannot be confirmed, let alone relied on.
   */
  async searchPage(_source: string, query: string, limit: number, page = 1): Promise<DecisionPage> {
    if (page > 1) return { results: [], pagingUnsupported: true };
    const submitted = await this.submit(query);
    const $ = cheerio.load(submitted.html);
    const needle = query.toLocaleLowerCase('de-DE');
    const results = $('#DV16_Table tbody tr').map((_, row) => {
      const cells = $(row).find('td'); const date = cells.eq(1).text().replace(/\s+/g, ' ').trim(); const fileNumber = cells.eq(2).text().replace(/\s+/g, ' ').trim(); const court = cells.eq(3).text().replace(/\s+/g, ' ').trim();
      const button = cells.eq(4).find('input[type="submit"]'); const name = button.attr('name') || ''; const value = button.attr('value') || ''; const snippet = cells.eq(2).find('[title]').attr('title')?.replace(/^Leitsatz:\s*/i, '') || '';
      return { id: encode({ query, name, value }), title: `${court} - ${fileNumber}`, subtitle: snippet, snippet, date, court, fileNumber };
    }).get().filter((result) => result.id.length > 10 && (!submitted.fallback || `${result.title} ${result.subtitle}`.toLocaleLowerCase('de-DE').includes(needle))).slice(0, limit);
    return { results };
  }

  async get(_source: string, id: string): Promise<DecisionEntry> {
    const hit = decode(id); const submitted = await this.submit(hit.query, hit); const $ = cheerio.load(submitted.html);
    const title = $('h1').first().text().replace(/\s+/g, ' ').trim() || $('title').text().trim(); $('script, style, form, nav').remove();
    const root = $('#DV1_C40, main, body').first(); const bodyText = $('body').text().replace(/\s+/g, ' ');
    return { title, content: turndown.turndown(root.html() || ''), url: URL, court: bodyText.match(/Oberlandesgericht Dresden|Landgericht Dresden/)?.[0] || 'Sachsen', date: bodyText.match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0] || '', fileNumber: hit.value };
  }
}
