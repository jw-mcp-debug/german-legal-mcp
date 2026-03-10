import axios from 'axios';
import { load } from 'cheerio';

const BASE_URL = 'https://www.gesetze-bayern.de';

interface BayernSession {
  cookies: string;
  token: string;
}

let session: BayernSession | null = null;

async function getSession(): Promise<BayernSession> {
  if (session) return session;
  const res = await axios.get(BASE_URL, { timeout: 15000 });
  const cookies = (res.headers['set-cookie'] || []).map((c: string) => c.split(';')[0]).join('; ');
  const $ = load(res.data);
  const token = $('input[name="__RequestVerificationToken"]').val() as string;
  session = { cookies, token };
  return session;
}

export async function searchBayern(query: string, limit: number): Promise<{ title: string; docId: string; subtitle: string }[]> {
  const s = await getSession();
  const res = await axios.post(`${BASE_URL}/Search`, `__RequestVerificationToken=${encodeURIComponent(s.token)}&SearchFields.Content=${encodeURIComponent(query)}`, {
    headers: { Cookie: s.cookies, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const $ = load(res.data);
  const results: { title: string; docId: string; subtitle: string }[] = [];

  $('a.hltitel, p.hltitel a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/Content\/Document\/([^?]+)/);
    if (!match || !match[1].startsWith('Y-')) return;
    const title = $(el).text().trim();
    const subtitle = $(el).closest('div').find('.hlSubTitel, p.hlSubTitel').text().trim();
    results.push({ title, docId: match[1], subtitle });
  });

  return results.slice(0, limit);
}

export async function fetchBayernDecision(docId: string): Promise<string> {
  const res = await axios.get(`${BASE_URL}/Content/Document/${docId}`, { timeout: 15000 });
  return res.data;
}
