import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { HTTP_USER_AGENT } from '../../../config.js';
import { validateConversion } from '../../../shared/converter.js';
import { RiiConverter } from '../converter.js';
import type { DecisionAdapter, DecisionEntry, DecisionGetOptions, DecisionPage, DecisionSearchResult } from '../types.js';

const BASE_URL = 'https://www.rechtsprechung-im-internet.de/jportal/portal/page/bsjrsprod.psml';

/**
 * The result count, taken from the `numberofresults` field the result-list form
 * carries on every page.
 *
 * Deliberately not the visible "N Treffer" text: the page also renders
 * "Das Blättern ans Ende der Trefferliste ist bei mehr als 3.000 Treffern nicht
 * möglich", so a naive scrape of the first number followed by "Treffer" reports
 * that 3.000 threshold as the total — 3.000 where the true figure was 6.296.
 */
export function parseFederalTotalHits(html: string): number | undefined {
  const match = html.match(/name="numberofresults"\s+value="(\d+)"/)
    ?? html.match(/numberofresults=(\d+)/);
  if (!match?.[1]) return undefined;
  const total = Number.parseInt(match[1], 10);
  return Number.isNaN(total) ? undefined : total;
}

export class FederalDecisionAdapter implements DecisionAdapter {
  readonly sources = ['BUND'] as const;

  constructor(private readonly http: Pick<AxiosInstance, 'get'> = axios, private readonly converter: RiiConverter = new RiiConverter()) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    return (await this.searchPage(_source, query, limit)).results;
  }

  /**
   * First page only.
   *
   * Paging here is a stateful Jetspeed portlet: the "weiter" control submits
   * `resultListForm` with `eventSubmit_doSkipforward`, and the server keeps the
   * result set against a portal navigation context that appears in the URL as a
   * `/t/<token>/` segment. A stateless search request never enters that context
   * — replaying the form against a fresh session returns an empty search mask,
   * verified against the live site with a matching JSESSIONID — so a page-two
   * request is reported as unsupported instead of silently re-serving page one.
   */
  async searchPage(_source: string, query: string, limit: number, page = 1): Promise<DecisionPage> {
    if (page > 1) return { results: [], pagingUnsupported: true };
    const response = await this.http.get<string>(`${BASE_URL}/js_peid/Suchportlet2/media-type/html`, {
      params: { formhaschangedvalue: 'yes', eventSubmit_doSearch: 'suchen', action: 'portlets.jw.MainAction', form: 'jurisExpertSearch', desc: 'text', query },
      headers: { 'User-Agent': HTTP_USER_AGENT },
    });
    const $ = cheerio.load(response.data);
    const results = $('a.TrefferlisteHervorheben[id^="tlid"]').toArray().filter((el) => !$(el).attr('id')?.includes('.')).slice(0, limit).map((el) => {
      const link = $(el);
      const href = link.attr('href') || '';
      const id = href.match(/doc\.id=([^&]+)/)?.[1] || '';
      const row = link.closest('tr');

      // The link's `title` attribute is only the hit's ordinal — "1. Treffer
      // Langtext" — so it was previously the whole title, leaving every BUND
      // row without court, date, file number or a usable label. The row itself
      // carries all of it: date in the leading cell, court in <strong>,
      // file number after the pipe, decision type in <em>.
      const date = row.children('td').first().text().trim();
      const court = link.find('strong').first().text().trim();
      // The row is two lines separated by <br>: "court | file number" then
      // "type | summary". `.text()` erases that break, so splitting on the tag
      // is what keeps the decision type out of the file number.
      const firstLine = (link.find('span').first().html() ?? '').split(/<br\s*\/?>/i)[0] ?? '';
      const headingText = cheerio.load(`<div>${firstLine}</div>`)('div').text()
        .replace(/\s+/g, ' ').trim();
      const fileNumber = court && headingText.startsWith(court)
        ? headingText.slice(court.length).replace(/^\s*\|\s*/, '').trim()
        : '';
      const decisionType = link.find('em').first().text().trim();
      const summary = link.find('strong').last().text().replace(/\s+/g, ' ').trim();

      return {
        id,
        // Preference order: the court's own summary sentence, then the decision
        // type, then "court | file number". The link's `title` attribute is last
        // because on a real result page it is only the hit's ordinal
        // ("1. Treffer Langtext"); it is retained solely so a stripped-down or
        // changed layout still yields something rather than an empty cell.
        title: (summary && summary !== court ? summary : '')
          || decisionType || headingText || link.attr('title') || link.text().trim(),
        subtitle: [decisionType, court, fileNumber].filter(Boolean).join(' | '),
        date,
        ...(court ? { court } : {}),
        ...(fileNumber ? { fileNumber } : {}),
        snippet: row.find('.docPreview').text().replace(/\s+/g, ' ').trim(),
        url: `${BASE_URL}?doc.id=${id}`,
      };
    }).filter((r) => r.id);
    const totalHits = parseFederalTotalHits(response.data);
    return { results, ...(totalHits === undefined ? {} : { totalHits }) };
  }

  async get(_source: string, id: string, options: DecisionGetOptions = {}): Promise<DecisionEntry> {
    const response = await this.http.get<string>(BASE_URL, { params: { 'doc.id': id, 'doc.part': options.part || 'L', showdoccase: '1', paramfromHL: 'true' }, headers: { 'User-Agent': HTTP_USER_AGENT } });
    const d = this.converter.extractDecision(response.data);
    validateConversion(d.content, 'Rechtsprechung im Internet');
    return { title: d.title, content: d.content, url: `${BASE_URL}?doc.id=${id}`, court: d.court, date: d.date, fileNumber: d.fileNumber, ...(d.ecli ? { ecli: d.ecli } : {}) };
  }
}
