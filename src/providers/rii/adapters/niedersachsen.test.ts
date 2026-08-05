import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { NiedersachsenDecisionAdapter } from './niedersachsen.js';

describe('NiedersachsenDecisionAdapter', () => {
  it('regresses NI-VORIS search and full-text conversion against HTML samples', async () => {
    const html = await readFile(new URL('./fixtures/ni-decision.html', import.meta.url), 'utf8');
    const adapter = new NiedersachsenDecisionAdapter({ get: async (_url, options) => ({ data: options?.params?.query ? '<div class="egal-search-result-item"><div class="egal-search-result-item-title"><h3><a href="/browse/document/ni-1">OVG Niedersachsen, 22.07.2008 - 5 LA 426/07</a></h3></div><p class="egal-search-result-item-snippet">VwVfG Niedersachsen</p><p class="egal-search-result-item-extra">Entscheidungsdatum: 22.07.2008</p></div>' : html }) });
    await expect(adapter.search('NI', 'VwVfG', 1)).resolves.toMatchObject([{ id: 'ni-1', date: '22.07.2008', court: 'OVG Niedersachsen' }]);
    await expect(adapter.get('NI', 'ni-1')).resolves.toMatchObject({ fileNumber: '5 LA 426/07', content: expect.stringContaining('Die Beschwerde wird zurückgewiesen.') });
  });

  it('parses the current wkde bibliography definition list', async () => {
    const html = '<html><head><title>Fallback | NI-VORIS</title></head><body>'
      + '<h1 class="wkde-doctitle">Datenschutzrechtliche Entscheidung</h1>'
      + '<div class="wkde-bibliography"><dl>'
      + '<dt>Gericht</dt><dd>OVG Niedersachsen</dd>'
      + '<dt>Datum</dt><dd>03.08.2026</dd>'
      + '<dt>Aktenzeichen</dt><dd>11 LA 42/26</dd>'
      + '<dt>ECLI</dt><dd>ECLI:DE:OVGNI:2026:0803.11LA42.26.00</dd>'
      + '</dl></div>'
      + '<div class="wkde-document-body"><p>Die Entscheidung enthält einen vollständigen Text.</p></div>'
      + '</body></html>';
    const adapter = new NiedersachsenDecisionAdapter({ get: async () => ({ data: html }) });

    await expect(adapter.get('NI', 'ni-current')).resolves.toMatchObject({
      title: 'Datenschutzrechtliche Entscheidung',
      court: 'OVG Niedersachsen',
      date: '03.08.2026',
      fileNumber: '11 LA 42/26',
      ecli: 'ECLI:DE:OVGNI:2026:0803.11LA42.26.00',
    });
  });
});
