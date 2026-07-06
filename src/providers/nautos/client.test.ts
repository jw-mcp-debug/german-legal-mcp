import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockAxios, mockInstance } = vi.hoisted(() => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { headers: { common: {} as Record<string, string> } },
  };
  return {
    mockInstance,
    mockAxios: {
      create: () => mockInstance,
      post: vi.fn(),
      get: vi.fn(),
      isAxiosError: (e: unknown): boolean => (e as { isAxiosError?: boolean })?.isAxiosError === true,
    },
  };
});

vi.mock('axios', () => ({ default: mockAxios }));
vi.mock('./config.js', () => ({
  nautosConfig: { baseUrl: 'http://nautos', tenantKey: 'TENANT', username: 'u', password: 'p' },
}));

import { NautosClient } from './client.js';

function jwt(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return `h.${payload}.s`;
}

beforeEach(() => {
  mockInstance.get.mockReset();
  mockInstance.post.mockReset();
  mockAxios.post.mockReset();
  // IP-based login (module axios.post) yields a JWT session.
  mockAxios.post.mockResolvedValue({ data: { token: jwt(), userAccountId: 'acc' } });
});

describe('NautosClient', () => {
  it('authenticates then parses search results', async () => {
    mockInstance.post.mockResolvedValueOnce({
      data: {
        count: 1,
        searchResultItems: [{
          id: 'A1', documentNumber: 'DIN 1', titleDe: 'Standard',
          dateOfIssue: '2020', documentType: ['norm'], score: 1,
        }],
      },
    });

    const result = await new NautosClient().search('DIN 1');

    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({ acCode: 'A1', documentNumber: 'DIN 1', title: 'Standard' });
  });

  it('fetches document detail with viewer access metadata', async () => {
    mockInstance.get.mockResolvedValueOnce({
      data: { id: 'A1', documentNumber: 'DIN 1', titleDe: 'Standard', valid: true, documentType: ['norm'], classificationIcs: [] },
    });
    mockInstance.post.mockResolvedValueOnce({ data: [{ fulltexts: [{ din21Id: 'D1', format: 'pdf' }] }] });

    const detail = await new NautosClient().getDetail('A1');

    expect(detail).toMatchObject({ acCode: 'A1', documentNumber: 'DIN 1', din21Id: 'D1', format: 'pdf' });
  });

  it('wraps an API error', async () => {
    mockInstance.post.mockRejectedValueOnce(new Error('boom'));
    await expect(new NautosClient().search('x')).rejects.toThrow('boom');
  });

  it('runs the NV viewer auth chain, normalizes the TOC and caches the auth', async () => {
    mockInstance.get.mockImplementation(async (url: string) => {
      if (url.includes('/simultaneously/')) return { data: '"LOCK-1"' };
      if (url.includes('/octa/token')) return { data: { octaToken: 'OCTA' } };
      if (url.endsWith('/toc')) return {
        data: { body: { toc: { section: [
          { id: 's1', label: '1', title: 'Scope\nand purpose', section: { id: 's1.1', title: 'Sub' } },
          { title: 'No id section' },
        ] } } },
      };
      throw new Error(`unexpected get ${url}`);
    });
    mockInstance.post.mockImplementation(async (url: string) => {
      if (url.includes('/auth/user')) return { data: { xSHISecurity: jwt() } };
      throw new Error(`unexpected post ${url}`);
    });

    const client = new NautosClient();
    const toc = await client.getToc('D-toc');

    expect(toc).toEqual([
      { id: 's1', label: '1', title: 'Scope and purpose', section: [{ id: 's1.1', title: 'Sub' }] },
      { id: '', title: 'No id section' },
    ]);

    // A second call reuses the cached viewer auth — no second NV auth POST.
    await client.getToc('D-toc');
    const authPosts = mockInstance.post.mock.calls.filter(([u]: [string]) => u.includes('/auth/user'));
    expect(authPosts).toHaveLength(1);
  });

  it('fetches a section, accepting a string-form OCTA token', async () => {
    const octaString = `prefix:${'A'.repeat(64)}`;
    mockInstance.get.mockImplementation(async (url: string) => {
      if (url.includes('/simultaneously/')) return { data: 'LOCK-2' };
      if (url.includes('/octa/token')) return { data: octaString };
      if (url.endsWith('/doc')) return { data: { content: '## Section body' } };
      throw new Error(`unexpected get ${url}`);
    });
    mockInstance.post.mockImplementation(async () => ({ data: { xSHISecurity: jwt() } }));

    const section = await new NautosClient().getSection('D-sec', 'sect-1');
    expect(section).toBe('## Section body');
  });

  it('rejects when the OCTA token cannot be extracted', async () => {
    mockInstance.get.mockImplementation(async (url: string) => {
      if (url.includes('/simultaneously/')) return { data: 'LOCK-3' };
      if (url.includes('/octa/token')) return { data: 'no token here' };
      throw new Error(`unexpected get ${url}`);
    });
    await expect(new NautosClient().getToc('D-bad')).rejects.toThrow(/OCTA token/i);
  });
});
