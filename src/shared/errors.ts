export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly userMessage: string;
  abstract readonly recoveryHint?: string;

  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      recoveryHint: this.recoveryHint,
      cause: this.cause?.message,
    };
  }

  toString(): string {
    let msg = `${this.userMessage}\n\nError Code: ${this.code}`;
    if (this.recoveryHint) {
      msg += `\n\nHow to fix: ${this.recoveryHint}`;
    }
    if (this.cause) {
      msg += `\n\nTechnical details: ${this.cause.message}`;
    }
    return msg;
  }
}

export class RecoverableError extends BaseError {
  readonly code: string = 'RECOVERABLE_ERROR';
  readonly userMessage: string = 'A temporary error occurred. Please try again.';
  readonly recoveryHint?: string = 'Retry the operation after a short delay.';
}

export class PermanentError extends BaseError {
  readonly code: string = 'PERMANENT_ERROR';
  readonly userMessage: string = 'This operation cannot be completed.';
  readonly recoveryHint?: string = 'Check your input and try a different approach.';
}

export class RateLimitError extends BaseError {
  readonly code: string = 'RATE_LIMIT_EXCEEDED';
  readonly userMessage: string = 'Rate limit exceeded. Please wait before retrying.';
  declare readonly recoveryHint: string;

  constructor(message: string, public readonly retryAfter: number, cause?: Error) {
    super(message, cause);
    this.recoveryHint = `Wait ${Math.ceil(retryAfter / 1000)}s before retrying. Restart the MCP server after waiting.`;
  }
}

export class NetworkError extends RecoverableError {
  readonly code: string = 'NETWORK_ERROR';
  readonly userMessage: string = 'Network request failed.';
  readonly recoveryHint: string = 'Check your internet connection and retry.';
}

/** Convert AxiosError to a BaseError subclass */
export function wrapAxiosError(error: unknown): BaseError | null {
  if (!(error instanceof Error) || !('isAxiosError' in error)) return null;
  const axErr = error as Error & { code?: string; response?: { status: number; statusText: string } };
  const code = axErr.code ?? '';
  // Network-level failures (no response)
  if (!axErr.response) {
    if (code === 'ENOTFOUND') return new NetworkError(`DNS resolution failed: ${axErr.message}`, axErr);
    if (code === 'ECONNREFUSED') return new NetworkError(`Connection refused: ${axErr.message}`, axErr);
    if (code === 'ECONNRESET') return new NetworkError(`Connection reset: ${axErr.message}`, axErr);
    if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return new NetworkError(`Request timed out: ${axErr.message}`, axErr);
    return new NetworkError(axErr.message, axErr);
  }
  // HTTP-level failures
  const { status, statusText } = axErr.response;
  if (status === 404) return new PermanentError(`Not found (404): ${axErr.message}`);
  if (status === 403) return new PermanentError(`Forbidden (403): ${axErr.message}`);
  if (status === 401) return new AuthenticationError(`Unauthorized (401): ${axErr.message}`);
  if (status >= 500) return new NetworkError(`Server error (${status} ${statusText}): ${axErr.message}`, axErr);
  return new PermanentError(`HTTP ${status}: ${axErr.message}`);
}

export class AuthenticationError extends PermanentError {
  readonly code: string = 'AUTHENTICATION_FAILED';
  readonly userMessage: string = 'Authentication failed. Check your credentials.';
  readonly recoveryHint: string = 'Verify credentials are correct.';
}

export class ValidationError extends PermanentError {
  readonly code: string = 'VALIDATION_ERROR';
  readonly userMessage: string = 'Invalid input provided.';
  declare readonly recoveryHint: string;
  
  constructor(message: string, public readonly field?: string, cause?: Error) {
    super(message, cause);
    this.recoveryHint = field ? `Check the '${field}' parameter.` : 'Check your input parameters.';
  }
}

export class CacheError extends RecoverableError {
  readonly code: string = 'CACHE_ERROR';
  readonly userMessage: string = 'Cache operation failed.';
  readonly recoveryHint: string = 'The operation will continue without cache.';
}

export class BrowserError extends RecoverableError {
  readonly code: string = 'BROWSER_ERROR';
  readonly userMessage: string = 'Browser operation failed.';
  readonly recoveryHint: string = 'Restart the MCP server to reinitialize the browser.';
}

export class WorkstationDeniedError extends PermanentError {
  readonly code: string = 'WORKSTATION_DENIED';
  readonly userMessage: string = 'Access denied from this workstation/IP address.';
  readonly recoveryHint: string = 'Your Beck Online subscription requires access from a specific IP range (e.g., campus network). Please connect to the correct network (VPN if needed) and try again.';
}

export interface ParallelCitation {
  label: string;
  vpath: string;
}

export class NotIncludedError extends PermanentError {
  readonly code: string = 'NOT_INCLUDED';
  readonly userMessage: string = 'Document not included in your Beck Online subscription.';
  readonly recoveryHint: string = 'Try one of the parallel citations listed below.';

  constructor(message: string, public readonly citations: ParallelCitation[]) {
    super(message);
  }

  toJSON() {
    return { ...super.toJSON(), citations: this.citations };
  }
}

export interface AmbiguityOption { label: string; domain: string }

export class AmbiguityError extends PermanentError {
  readonly code: string = 'AMBIGUOUS';
  readonly userMessage: string = 'Search was ambiguous. Please select one of the options below.';
  readonly recoveryHint: string = 'Retry with a more specific query, e.g. include the state abbreviation.';

  constructor(message: string, public readonly options: AmbiguityOption[]) {
    super(message);
  }

  toJSON() {
    return { ...super.toJSON(), options: this.options };
  }
}
