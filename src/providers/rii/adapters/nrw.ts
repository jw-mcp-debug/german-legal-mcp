import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { HTTP_USER_AGENT } from '../../../config.js';
import type { DecisionAdapter, DecisionEntry, DecisionSearchResult } from '../types.js';
import type { Element } from 'domhandler';

const BASE = 'https://nrwesuche.justiz.nrw.de';
const turndown = new TurndownService({ headingStyle: 'atx' });

interface NrwHit { url: string; title: string; court: string; kind: string; fileNumber: string; ecli: string; date: string; norms: string; headnotes: string; }

function parseHit(el: Element, $: cheerio.CheerioAPI): NrwHit {
  const node = $(el);
  const text = node.text().replace(/\s+/g, ' ').trim();
  const value = (label: string): string => {
    if (label === 'ECLI') return text.match(/ECLI:\s*([A-Z0-9:.]+?)(?=Entscheidungsdatum|Normen|Leitsätze|$)/i)?.[1]?.trim() || '';
    return text.match(new RegExp(`${label}:\\s*(.*?)(?=\\s+(?:Gericht|Entscheidungsart|Aktenzeichen|ECLI|Entscheidungsdatum|Normen|Leitsätze):|$)`))?.[1]?.trim() || '';
  };
  return {
    url: node.find('a').attr('href') || '',
    title: node.find('a').text().trim(),
    court: value('Gericht'),
    kind: value('Entscheidungsart'),
    fileNumber: value('Aktenzeichen'),
    ecli: value('ECLI'),
    date: value('Entscheidungsdatum'),
    norms: value('Normen'),
    headnotes: value('Leitsätze'),
  };
}

function toResult(hit: NrwHit): DecisionSearchResult {
  return { id: hit.url, title: hit.title, subtitle: `${hit.court}${hit.fileNumber ? `, ${hit.fileNumber}` : ''}`, date: hit.date, court: hit.court, fileNumber: hit.fileNumber, ...(hit.ecli ? { ecli: hit.ecli } : {}), url: hit.url };
}

export class NRWDecisionAdapter implements DecisionAdapter {
  readonly sources = ['NW'] as const;

  constructor(private readonly http: Pick<AxiosInstance, 'get' | 'post'> = axios) {}

  async search(_source: string, query: string, limit: number): Promise<DecisionSearchResult[]> {
    const params = new URLSearchParams({
      q: query, method: 'stem', qSize: String(limit), sortieren_nach: 'relevanz', advanced_search: 'false',
      absenden: 'Suchen', gerichtstyp: '', gerichtsbarkeit: '', gerichtsort: '', entscheidungsart: '', date: '',
      aktenzeichen: '', schlagwoerter: '', von: '', bis: '', validFrom: '', von2: '', bis2: '',
    });
    const response = await this.http.post<string>(`${BASE}/index.php`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': HTTP_USER_AGENT },
    });
    const $ = cheerio.load(response.data);
    return $('.einErgebnis').slice(0, limit).map((_, el) => toResult(parseHit(el, $))).get();
  }

  async get(_source: string, id: string): Promise<DecisionEntry> {
    const response = await this.http.get<string>(id, { headers: { 'User-Agent': HTTP_USER_AGENT } });
    const $ = cheerio.load(response.data);
    const fields: Record<string, string> = {};
    $('.feldbezeichnung').each((_, el) => { fields[$(el).text().trim().replace(/:$/, '').toLowerCase()] = $(el).next('.feldinhalt').text().trim(); });
    $('.screen, script, style, nav, #nrwelogo, #nrwelogo2').remove();
    const body = $('#enclosingDiv').nextAll('.maindiv').toArray().map((el) => $.html(el)).join('\n');
    return {
      title: $('#nrwetitle').text().replace(/\s+/g, ' ').trim(), content: turndown.turndown(body), url: id,
      court: fields.gericht || '', date: fields.datum || '', fileNumber: fields.aktenzeichen || '', ...(fields.ecli ? { ecli: fields.ecli } : {}),
    };
  }
}
