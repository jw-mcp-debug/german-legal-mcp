import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockAxios, giiGetLegislation } = vi.hoisted(() => ({
  mockAxios: { get: vi.fn(), post: vi.fn() },
  giiGetLegislation: vi.fn(),
}));

vi.mock('axios', () => ({ default: mockAxios }));
vi.mock('../../../shared/clients/gii.js', () => ({ giiGetLegislation }));

import { GiiAdapter } from './gii.js';

beforeEach(() => {
  mockAxios.get.mockReset();
  giiGetLegislation.mockReset();
});

describe('GiiAdapter', () => {
  it('does not support search', async () => {
    await expect(new GiiAdapter().search('BUND', 'x', 10)).rejects.toThrow(/does not support search/i);
  });

  it('requires a law/section id', async () => {
    await expect(new GiiAdapter().get('BUND', 'bgb')).rejects.toThrow(/law\/section/i);
  });

  it('delegates get to the GII legislation client', async () => {
    giiGetLegislation.mockResolvedValue({ title: 'BGB § 823', content: 'Body', url: 'http://x' });
    const entry = await new GiiAdapter().get('BUND', 'bgb/823');
    expect(giiGetLegislation).toHaveBeenCalledWith('bgb', '823');
    expect(entry).toEqual({ title: 'BGB § 823', content: 'Body', url: 'http://x' });
  });

  it('parses the index page into a table of contents', async () => {
    const html = '<div id="paddingLR12">'
      + '<a href="/bgb/__1.html">§ 1 Beginn der Rechtsfähigkeit</a>'
      + '<a href="/bgb/__2.html">§ 2 Eintritt der Volljährigkeit</a>'
      + '</div>';
    mockAxios.get.mockResolvedValue({ data: Buffer.from(html, 'latin1') });

    const toc = await new GiiAdapter().toc('BUND', 'bgb');
    expect(toc.length).toBeGreaterThanOrEqual(1);
  });
});
