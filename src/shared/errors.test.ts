import { describe, it, expect } from 'vitest';
import { wrapAxiosError, NetworkError, PermanentError, AuthenticationError, LoginTimeoutError, RecoverableError } from './errors.js';

function makeAxiosError(code?: string, status?: number): Error & { isAxiosError: true; code?: string; response?: { status: number; statusText: string } } {
  const err = new Error(code ? `${code}: test` : `Request failed with status ${status}`) as any;
  err.isAxiosError = true;
  err.code = code;
  err.response = status ? { status, statusText: 'Test' } : undefined;
  return err;
}

describe('wrapAxiosError', () => {
  it('returns null for non-Axios errors', () => {
    expect(wrapAxiosError(new Error('plain'))).toBeNull();
    expect(wrapAxiosError('string')).toBeNull();
  });

  it('maps ENOTFOUND to NetworkError', () => {
    const result = wrapAxiosError(makeAxiosError('ENOTFOUND'));
    expect(result).toBeInstanceOf(NetworkError);
    expect(result!.code).toBe('NETWORK_ERROR');
  });

  it('maps ECONNREFUSED to NetworkError', () => {
    expect(wrapAxiosError(makeAxiosError('ECONNREFUSED'))).toBeInstanceOf(NetworkError);
  });

  it('maps ETIMEDOUT to NetworkError', () => {
    expect(wrapAxiosError(makeAxiosError('ETIMEDOUT'))).toBeInstanceOf(NetworkError);
  });

  it('maps 404 to PermanentError', () => {
    const result = wrapAxiosError(makeAxiosError(undefined, 404));
    expect(result).toBeInstanceOf(PermanentError);
    expect(result!.message).toContain('404');
  });

  it('maps 401 to AuthenticationError', () => {
    expect(wrapAxiosError(makeAxiosError(undefined, 401))).toBeInstanceOf(AuthenticationError);
  });

  it('maps 500 to NetworkError', () => {
    expect(wrapAxiosError(makeAxiosError(undefined, 500))).toBeInstanceOf(NetworkError);
  });

  it('maps 403 to PermanentError', () => {
    const result = wrapAxiosError(makeAxiosError(undefined, 403));
    expect(result).toBeInstanceOf(PermanentError);
    expect(result!.message).toContain('403');
  });
});

describe('LoginTimeoutError', () => {
  it('is recoverable and points at network/session, not credentials', () => {
    const err = new LoginTimeoutError('Login navigation did not complete: timeout');
    expect(err).toBeInstanceOf(RecoverableError);
    expect(err).not.toBeInstanceOf(AuthenticationError);
    expect(err.code).toBe('LOGIN_TIMEOUT');
    expect(err.recoveryHint).toMatch(/network|VPN|restart/i);
    expect(err.recoveryHint.toLowerCase()).not.toContain('verify credentials are correct');
  });
});
