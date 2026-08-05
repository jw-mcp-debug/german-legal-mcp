import { describe, expect, it } from 'vitest';
import { BremenDecisionAdapter } from './bremen.js';

const html = `<table><tr class="search-result"><td><em>03.07.2026</em></td><td><a href="detail.php?gsid=bremen73.c.26955.de" title="Tierschutz, 5 V 709/26, Beschluss vom 03.07.2026">Tierschutz, 5 V 709/26, Beschluss vom 03.07.2026</a><br>Zur Rechtmäßigkeit der Fortnahme und Veräußerung von Hunden</td></tr></table>`;

describe('BremenDecisionAdapter', () => {
  it('filters official VG overview results and preserves detail URL', async () => {
    const adapter = new BremenDecisionAdapter({ get: async () => ({ data: html }) });
    const results = await adapter.search('HB', 'Hunde', 10);
    expect(results[0]).toMatchObject({ title: 'Tierschutz, 5 V 709/26', date: '03.07.2026' });
    expect(results[0].id).toContain('detail.php');
  });

  it('handles archive rows without a detail link and converts detail HTML', async () => {
    const adapter = new BremenDecisionAdapter({ get: async (url) => ({ data: url.includes('detail') ? '<main><h1>Testentscheidung</h1><p>Beschluss vom 01.01.2026, 1 V 2/26</p></main>' : '<table><tr class="search-result"><td><em>01.01.2026</em></td><td>Archivhinweis</td></tr></table>' }) });
    expect(await adapter.search('HB', '', 10)).toHaveLength(1);
    const entry = await adapter.get('HB', 'https://example.test/detail.php');
    expect(entry.content).toContain('Beschluss');
    expect(entry.date).toBe('01.01.2026');
  });
});
