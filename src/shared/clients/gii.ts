import { HTTP_USER_AGENT } from '../../config.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { rootLogger } from '../logger.js';

const logger = rootLogger.child({ module: 'gii-client' });

const BASE_URL = 'https://www.gesetze-im-internet.de';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

export interface GiiResult {
  title: string;
  section: string;
  content: string;
  url: string;
  prev: string | null;
  next: string | null;
}

export async function giiGetLegislation(law: string, section: string): Promise<GiiResult> {
  const lawNorm = law.toLowerCase();

  let sectionNorm = section.trim();
  sectionNorm = sectionNorm.replace(/^(§|Paragraph|Para\.?|Art\.?)\s*/i, '');
  if (!sectionNorm.startsWith('__')) {
    sectionNorm = '__' + sectionNorm;
  }

  const url = `${BASE_URL}/${lawNorm}/${sectionNorm}.html`;
  logger.info('Fetching legislation', { law, section, url });

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': HTTP_USER_AGENT },
      responseType: 'arraybuffer',
    });

    const html = Buffer.from(response.data).toString('latin1');
    const $ = cheerio.load(html);

    const lawTitle = $('.jnheader h1')
      .contents()
      .filter(function () { return this.type === 'text'; })
      .text()
      .trim();
    const sectionLabel = $('.jnenbez').text().trim();
    const sectionTitle = $('.jnentitel').text().trim();
    const contentHtml = $('.jnhtml').html() || '';
    const content = turndown.turndown(contentHtml);
    const prevHref = $('a[href*="__"][title*="vorherigen"]').attr('href');
    const nextHref = $('a[href*="__"][title*="nachfolgenden"]').attr('href');

    return {
      title: `${lawTitle}\n${sectionLabel} ${sectionTitle}`,
      section: sectionLabel,
      content,
      url,
      prev: prevHref || null,
      next: nextHref || null,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error(`Legislation not found: ${law} ${section}`, { cause: error });
    }
    throw error;
  }
}
