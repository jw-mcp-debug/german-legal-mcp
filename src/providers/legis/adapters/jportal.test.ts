import { describe, expect, it, vi, beforeEach } from 'vitest';

const { jportalSearch, jportalGetDocument } = vi.hoisted(() => ({
  jportalSearch: vi.fn(),
  jportalGetDocument: vi.fn(),
}));
vi.mock('../../../shared/clients/jportal.js', () => ({
  jportalSearch,
  jportalGetDocument,
  JPORTAL_STATES: ['HE', 'RP'],
}));

import { JPortalAdapter } from './jportal.js';

beforeEach(() => { jportalSearch.mockReset(); jportalGetDocument.mockReset(); });

describe('JPortalAdapter', () => {
  it('maps jPortal search hits to legis search results', async () => {
    jportalSearch.mockResolvedValue([
      { docId: 'jlr-Foo', title: 'Hessisches Gesetz', subtitle: 'HGes', date: '2020-01-01' },
    ]);

    const results = await new JPortalAdapter().search('HE', 'gesetz', 5);

    expect(jportalSearch).toHaveBeenCalledWith('HE', 'gesetz', 5);
    expect(results).toEqual([
      { id: 'jlr-Foo', title: 'Hessisches Gesetz', subtitle: 'HGes', date: '2020-01-01' },
    ]);
  });

  it('prepends parsed metadata to the rendered document body', async () => {
    jportalGetDocument.mockResolvedValue({
      head: '<table><tr><th>Gültig ab:</th><td>2020</td></tr></table>',
      text: '<h2>§ 1</h2><p>Inhalt.</p>',
      title: 'Hessisches Gesetz',
      permalink: 'https://example.test/jlr-Foo',
    });

    const entry = await new JPortalAdapter().get('HE', 'jlr-Foo');

    expect(entry.title).toBe('Hessisches Gesetz');
    expect(entry.content).toContain('**Gültig ab:** 2020'); // metadata block
    expect(entry.content).toContain('§ 1');
    expect(entry.content).toContain('---'); // separator between metadata and body
    expect(entry.url).toBe('https://example.test/jlr-Foo');
  });

  it('omits the metadata block when the head has no key/value rows', async () => {
    jportalGetDocument.mockResolvedValue({
      head: '<table></table>', text: '<p>Body.</p>', title: 'T', permalink: 'u',
    });
    const entry = await new JPortalAdapter().get('RP', 'x');
    expect(entry.content).not.toContain('---');
    expect(entry.content).toContain('Body');
  });
});
