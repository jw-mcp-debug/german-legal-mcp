import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { LOG_REDACT_CONFIG, SENSITIVE_LOG_KEYS, sanitizeUrl } from './logger.js';

/**
 * Drives a pino logger with the exact redaction config the real logger uses,
 * writing to a synchronous in-memory sink so we can assert on the serialized
 * output. This validates that credentials, cookies and tokens never reach a
 * log sink — the Phase 7.1 "sensitive data is covered by logging tests" gate.
 */
function captureLog(obj: Record<string, unknown>, msg = 'event'): { raw: string; parsed: Record<string, unknown> } {
  const lines: string[] = [];
  const stream = { write: (s: string) => { lines.push(s); } };
  const log = pino({ redact: LOG_REDACT_CONFIG, base: undefined }, stream as unknown as pino.DestinationStream);
  log.info(obj, msg);
  const raw = lines.join('');
  return { raw, parsed: JSON.parse(raw) as Record<string, unknown> };
}

describe('sanitizeUrl', () => {
  it('strips userinfo credentials', () => {
    expect(sanitizeUrl('https://user:s3cret@private.example.com/doc'))
      .toBe('https://private.example.com/doc');
  });

  it('redacts sensitive query parameters but keeps the rest', () => {
    const out = sanitizeUrl('https://example.com/login?token=abc123&doc=bgb.p823&jwt=eyJ');
    expect(out).not.toContain('abc123');
    expect(out).not.toContain('eyJ');
    expect(out).toContain('token=%5Bredacted%5D');
    expect(out).toContain('doc=bgb.p823');
  });

  it('is case-insensitive on parameter names', () => {
    expect(sanitizeUrl('https://example.com/x?Token=abc&Session=xyz')).not.toContain('abc');
  });

  it('strips inline userinfo from non-parseable strings without throwing', () => {
    // Protocol-relative URL: `new URL()` throws, so the regex fallback runs.
    expect(sanitizeUrl('//admin:hunter2@host/path')).toBe('//[redacted]@host/path');
  });

  it('strips userinfo even from exotic but parseable schemes', () => {
    expect(sanitizeUrl('ldap://admin:hunter2@host')).toBe('ldap://host');
  });

  it('leaves a plain vpath untouched', () => {
    expect(sanitizeUrl('bibdata/ges/bgb/cont/bgb.p823.htm'))
      .toBe('bibdata/ges/bgb/cont/bgb.p823.htm');
  });

  it('returns empty/non-strings unchanged', () => {
    expect(sanitizeUrl('')).toBe('');
  });
});

describe('logger redaction', () => {
  it('redacts every known sensitive key at the top level', () => {
    const secret = 'MUST-NOT-APPEAR';
    const obj: Record<string, unknown> = {};
    for (const key of SENSITIVE_LOG_KEYS) obj[key] = secret;

    const { raw, parsed } = captureLog(obj);

    expect(raw).not.toContain(secret);
    for (const key of SENSITIVE_LOG_KEYS) {
      expect(parsed[key]).toBe('[redacted]');
    }
  });

  it('redacts sensitive keys nested one level deep', () => {
    const { raw, parsed } = captureLog({
      error: { name: 'AuthError', password: 'hunter2', token: 'abc', message: 'boom' },
    });
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('abc');
    const error = parsed.error as Record<string, unknown>;
    expect(error.password).toBe('[redacted]');
    expect(error.token).toBe('[redacted]');
    expect(error.message).toBe('boom'); // non-sensitive sibling preserved
  });

  it('sanitizes url and href values instead of dropping them', () => {
    const { raw, parsed } = captureLog({
      url: 'https://u:p@example.com/x?token=leak',
      nested: { href: 'https://example.com/y?session=leak2' },
    });
    expect(raw).not.toContain('leak');
    expect(raw).not.toContain('u:p@');
    expect(parsed.url).toContain('example.com/x');
    expect(parsed.url).toContain('token=%5Bredacted%5D');
    expect((parsed.nested as Record<string, unknown>).href).toContain('session=%5Bredacted%5D');
  });

  it('preserves the message and non-sensitive context', () => {
    const { parsed } = captureLog({ provider: 'demo', requestId: 'req-1', durationMs: 42 }, 'fetch done');
    expect(parsed.msg).toBe('fetch done');
    expect(parsed.provider).toBe('demo');
    expect(parsed.requestId).toBe('req-1');
    expect(parsed.durationMs).toBe(42);
  });
});
