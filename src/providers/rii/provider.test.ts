import { describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import { RiiConverter } from './converter.js';
import { RiiProvider } from './provider.js';

function http() {
  return {
    get: vi.fn(async (_url: string, options?: { params?: Record<string, string> }) => {
      if (options?.params?.['doc.id']) {
        return {
          data: '<div class="docLayoutTitel">Title</div>' +
            '<table><tr><td><strong>Gericht:</strong></td><td>BGH</td></tr>' +
            '<tr><td><strong>Aktenzeichen:</strong></td><td>I ZR 1/25</td></tr></table>' +
            '<div class="docLayoutText"><p>Decision text with enough meaningful ' +
            'legal content to satisfy conversion validation. This synthetic fixture ' +
            'describes a complete holding and its supporting reasons.</p></div>',
        };
      }
      return {
        data: '<a class="TrefferlisteHervorheben" id="tlid1" ' +
          'href="?doc.id=case-1" title="Decision">Decision</a>',
      };
    }),
  } as unknown as Pick<AxiosInstance, 'get'>;
}

describe('RiiProvider', () => {
  it('searches and retrieves federal decisions through injected HTTP', async () => {
    const provider = new RiiProvider(http(), new RiiConverter());
    await expect(provider.handleToolCall('rii:search', {
      query: 'copyright',
      source: 'BUND',
    })).resolves.toMatchObject({
      content: [{ text: expect.stringContaining('case-1') }],
    });
    await expect(provider.handleToolCall('rii:get_decision', {
      doc_id: 'case-1',
      source: 'BUND',
    })).resolves.toMatchObject({
      content: [{ text: expect.stringContaining('Decision text') }],
    });
    await expect(provider.handleToolCall('rii:unknown', {}))
      .resolves.toMatchObject({ isError: true });
  });
});
