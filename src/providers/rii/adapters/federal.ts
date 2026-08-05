import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { HTTP_USER_AGENT } from '../../../config.js';
import { validateConversion } from '../../../shared/converter.js';
import { RiiConverter } from '../converter.js';
import type { DecisionAdapter, DecisionEntry, DecisionGetOptions, DecisionSearchResult } from '../types.js';

const BASE_URL = 'https://www.rechtsprechung-im-internet.de/jportal/portal/page/bsjrsprod.psml';

export class FederalDecisionAdapter implements DecisionAdapter {
  readonly sources = ['BUND'] as const;

  constructor(private readonly http: Pick<AxiosInstance, 'get'> = axios, private readonly converter: RiiConverter = new RiiConverter()) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    const response = await this.http.get<string>(`${BASE_URL}/js_peid/Suchportlet2/media-type/html`, {
      params: { formhaschangedvalue: 'yes', eventSubmit_doSearch: 'suchen', action: 'portlets.jw.MainAction', form: 'jurisExpertSearch', desc: 'text', query },
      headers: { 'User-Agent': HTTP_USER_AGENT },
    });
    const $ = cheerio.load(response.data);
    return $('a.TrefferlisteHervorheben[id^="tlid"]').toArray().filter((el) => !$(el).attr('id')?.includes('.')).slice(0, limit).map((el) => {
      const href = $(el).attr('href') || '';
      const id = href.match(/doc\.id=([^&]+)/)?.[1] || '';
      return { id, title: $(el).attr('title') || $(el).text().trim(), subtitle: '', date: '', snippet: $(el).closest('tr').find('.docPreview').text().trim(), url: `${BASE_URL}?doc.id=${id}` };
    }).filter((r) => r.id);
  }

  async get(_source: string, id: string, options: DecisionGetOptions = {}): Promise<DecisionEntry> {
    const response = await this.http.get<string>(BASE_URL, { params: { 'doc.id': id, 'doc.part': options.part || 'L', showdoccase: '1', paramfromHL: 'true' }, headers: { 'User-Agent': HTTP_USER_AGENT } });
    const d = this.converter.extractDecision(response.data);
    validateConversion(d.content, 'Rechtsprechung im Internet');
    return { title: d.title, content: d.content, url: `${BASE_URL}?doc.id=${id}`, court: d.court, date: d.date, fileNumber: d.fileNumber, ...(d.ecli ? { ecli: d.ecli } : {}) };
  }
}
