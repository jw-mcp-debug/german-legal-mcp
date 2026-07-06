import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockAxios } = vi.hoisted(() => ({ mockAxios: { get: vi.fn(), post: vi.fn() } }));
vi.mock('axios', () => ({ default: mockAxios }));

import { BremenAdapter } from './bremen.js';

beforeEach(() => mockAxios.get.mockReset());

describe('BremenAdapter', () => {
  it('parses metainformation links into search results', async () => {
    mockAxios.get.mockResolvedValue({
      data: '<a href="metainformationen/gesetz-12345?lang=de">Bremisches Informationsfreiheitsgesetz</a>',
    });

    const results = await new BremenAdapter().search('HB', 'informationsfreiheit', 10);

    expect(results).toEqual([
      { id: '12345', title: 'Bremisches Informationsfreiheitsgesetz', subtitle: '', date: '' },
    ]);
  });

  it('renders a document to markdown', async () => {
    mockAxios.get.mockResolvedValue({
      data: '<html><head><title>Gesetz X - Transparenzportal Bremen</title></head><body>'
        + '<div class="main_article gesetz"><h2>§ 1 Zweck</h2><p>Inhalt.</p></div></body></html>',
      request: {},
    });

    const entry = await new BremenAdapter().get('HB', '12345');

    expect(entry.title).toBe('Gesetz X');
    expect(entry.content).toContain('§ 1 Zweck');
    expect(entry.content).toContain('Inhalt');
  });
});
