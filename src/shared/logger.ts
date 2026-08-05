import pino from 'pino';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { getLogLevel } from '../config.js';
import { LOG_DIR } from './state-paths.js';

// Ensure log directory exists
try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch { /* ignore */ }

const level = getLogLevel();

/**
 * Context keys whose values are credentials or session material and must never
 * reach a log sink. Matched at the top level and one level of nesting
 * (e.g. `error.password`). Case-sensitive, per pino's redaction paths.
 */
export const SENSITIVE_LOG_KEYS = [
  'password', 'pwd', 'cookie', 'cookies', 'setCookie', 'set-cookie',
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'idToken', 'id_token', 'apiKey', 'apikey', 'authorization', 'auth',
  'secret', 'tenantKey', 'credential', 'credentials',
] as const;

/** Query parameters that commonly carry session tokens or one-time credentials. */
const SENSITIVE_QUERY_PARAMS = new Set([
  'token', 'ticket', 'code', 'session', 'sessionid', 'jsessionid', 'jwt',
  'password', 'pwd', 'auth', 'access_token', 'id_token', 'refresh_token',
  'api_key', 'apikey', 'key', 'secret', 'signature', 'sig',
]);

/**
 * Strip credentials from a URL before logging: remove any `user:pass@` userinfo
 * and redact the values of sensitive query parameters, while keeping the URL
 * shape useful for diagnostics. Never throws — falls back to a regex strip.
 */
export function sanitizeUrl(raw: string): string {
  if (typeof raw !== 'string' || raw.length === 0) return raw;
  try {
    const url = new URL(raw);
    if (url.username) url.username = '';
    if (url.password) url.password = '';
    for (const [name] of url.searchParams) {
      if (SENSITIVE_QUERY_PARAMS.has(name.toLowerCase())) {
        url.searchParams.set(name, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    // Not a parseable absolute URL (e.g. a vpath) — only strip inline userinfo.
    return raw.replace(/(\/\/)[^/@\s]+:[^/@\s]+@/, '$1[redacted]@');
  }
}

const REDACT_CENSOR = '[redacted]';

// Redact known-sensitive keys at the top level and one level deep, and rewrite
// any `url`/`href` value through the credential-stripping sanitizer.
const redactPaths = [
  ...SENSITIVE_LOG_KEYS,
  ...SENSITIVE_LOG_KEYS.map((k) => `*.${k}`),
  'url', '*.url', 'href', '*.href',
];
export const LOG_REDACT_CONFIG: pino.LoggerOptions['redact'] = {
  paths: redactPaths,
  censor: (value: unknown, path: string[]): unknown => {
    const leaf = path[path.length - 1];
    if (leaf === 'url' || leaf === 'href') return sanitizeUrl(String(value));
    return REDACT_CENSOR;
  },
};

// Build transports: always stderr + file with rotation
const targets: pino.TransportTargetOptions[] = [
  // stderr (for MCP clients that capture it)
  {
    target: 'pino-pretty',
    level,
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      destination: 2,
    },
  },
  // File with daily rotation, 7 days retention, 10MB limit
  {
    target: 'pino-roll',
    level,
    options: {
      file: join(LOG_DIR, 'mcp'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      extension: '.log',
      limit: { count: 7 },
      size: '10m',
      mkdir: true,
    },
  },
];

const transport = pino.transport({ targets });
const logger = pino({ level, redact: LOG_REDACT_CONFIG }, transport);

export type LogContext = {
  /** Provider namespace, e.g. `ris`, `legis`. */
  provider?: string;
  /** Module or component within a provider, e.g. `ris-provider`. */
  module?: string;
  /** Correlates all log lines of one logical request across processes. */
  requestId?: string | undefined;
  operation?: string;
  vpath?: string;
  url?: string;
  /** Wall-clock duration of an operation, in milliseconds. */
  durationMs?: number;
  /** @deprecated Use {@link durationMs}. Kept for back-compat. */
  duration?: number;
  [key: string]: unknown;
};

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  debug(msg: string, context?: LogContext): void {
    logger.debug({ ...this.context, ...context }, msg);
  }

  info(msg: string, context?: LogContext): void {
    logger.info({ ...this.context, ...context }, msg);
  }

  warn(msg: string, context?: LogContext): void {
    logger.warn({ ...this.context, ...context }, msg);
  }

  error(msg: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = error instanceof Error ? {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    } : { error };
    logger.error({ ...this.context, ...context, ...errorContext }, msg);
  }
}

export const rootLogger = new Logger();
