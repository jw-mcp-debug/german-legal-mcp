import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockInstance, mockAxios, captured } = vi.hoisted(() => {
  const captured: { fn?: (res: unknown) => unknown } = {};
  const mockInstance = {
    get: vi.fn(),
    interceptors: { response: { use: vi.fn((fn: (res: unknown) => unknown) => { captured.fn = fn; }) } },
  };
  return { mockInstance, mockAxios: { create: vi.fn(() => mockInstance) }, captured };
});
vi.mock('axios', () => ({ default: mockAxios }));

import { DipClient } from './client.js';

beforeEach(() => mockInstance.get.mockReset());

describe('DipClient', () => {
  it('returns search results from each endpoint', async () => {
    const result = { numFound: 1, documents: [{ id: '1', titel: 'T', datum: '2025-01-01' }], cursor: 'c' };
    mockInstance.get.mockResolvedValue({ data: result });
    const client = new DipClient();

    await expect(client.searchDrucksachen({ q: 'x' })).resolves.toEqual(result);
    await expect(client.searchVorgang({ q: 'x' })).resolves.toEqual(result);
    await expect(client.searchPlenarprotokollText({ q: 'x' })).resolves.toEqual(result);
    expect(mockInstance.get).toHaveBeenCalledWith('/drucksache', { params: { q: 'x' } });
  });

  it('fetches a single Drucksache by id', async () => {
    mockInstance.get.mockResolvedValue({ data: { id: '42', titel: 'D', datum: '2025-01-01' } });
    await expect(new DipClient().getDrucksache('42')).resolves.toMatchObject({ id: '42' });
  });

  it('raises a clear error when the API returns an Enodia rate-limit challenge', () => {
    new DipClient(); // registers the response interceptor
    expect(captured.fn).toBeTypeOf('function');
    expect(() => captured.fn!({ data: '<html>Enodia challenge</html>' }))
      .toThrow(/rate limit/i);
  });

  it('passes through a normal response via the interceptor', () => {
    new DipClient();
    const ok = { data: { numFound: 0 } };
    expect(captured.fn!(ok)).toBe(ok);
  });
});
