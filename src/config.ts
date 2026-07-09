export type Environment = Readonly<Record<string, string | undefined>>;

export interface EnvironmentVariable {
  name: string;
  description: string;
  defaultValue?: string;
  secret?: boolean;
}

export class ConfigurationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Configuration validation failed:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigurationError';
  }
}

export const ENVIRONMENT_VARIABLES: readonly EnvironmentVariable[] = [
  { name: 'GLMCP_STATE_DIR', description: 'Application state root directory.' },
  { name: 'GLMCP_LOG_LEVEL', description: 'Structured log level.', defaultValue: 'info' },
  { name: 'GLMCP_ARXIV_ENABLED', description: 'Enable the arXiv provider.', defaultValue: 'true' },
  { name: 'GLMCP_DIP_API_KEY', description: 'DIP API key.', secret: true },
  { name: 'GLMCP_DIP_ENABLED', description: 'Enable the DIP provider.', defaultValue: 'true' },
  { name: 'GLMCP_EUL_ENABLED', description: 'Enable the EUR-Lex provider.', defaultValue: 'true' },
  { name: 'GLMCP_ICU_ENABLED', description: 'Enable the InfoCuria provider.', defaultValue: 'true' },
  { name: 'GLMCP_LEGIS_ENABLED', description: 'Enable the legislation provider.', defaultValue: 'true' },
  { name: 'GLMCP_RII_ENABLED', description: 'Enable the RII provider.', defaultValue: 'true' },
  { name: 'GLMCP_RIS_ENABLED', description: 'Enable the RIS (Austria) provider.', defaultValue: 'true' },
  { name: 'GLMCP_NAUTOS_ENABLED', description: 'Enable the Nautos provider.' },
  { name: 'GLMCP_NAUTOS_TENANT_KEY', description: 'Nautos tenant key.', secret: true },
  { name: 'GLMCP_NAUTOS_TENANT_ID', description: 'Nautos tenant ID.' },
  { name: 'GLMCP_NAUTOS_USERNAME', description: 'Nautos username.', secret: true },
  { name: 'GLMCP_NAUTOS_PASSWORD', description: 'Nautos password.', secret: true },
] as const;

export function getEnvironment(): Environment {
  return process.env;
}

export function readStringEnv(
  name: string,
  env: Environment = getEnvironment(),
): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function readBooleanEnv(
  name: string,
  defaultValue: boolean,
  env: Environment = getEnvironment(),
): boolean {
  const value = readStringEnv(name, env);
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigurationError([`${name} must be "true" or "false", received "${value}"`]);
}

export function readIntegerEnv(
  name: string,
  defaultValue: number,
  options: { min?: number; max?: number } = {},
  env: Environment = getEnvironment(),
): number {
  const raw = readStringEnv(name, env);
  if (raw === undefined) return defaultValue;
  if (!/^-?\d+$/.test(raw)) {
    throw new ConfigurationError([`${name} must be an integer, received "${raw}"`]);
  }
  const value = Number(raw);
  if (options.min !== undefined && value < options.min) {
    throw new ConfigurationError([`${name} must be at least ${options.min}, received ${value}`]);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ConfigurationError([`${name} must be at most ${options.max}, received ${value}`]);
  }
  return value;
}

export function readUrlEnv(
  name: string,
  env: Environment = getEnvironment(),
): string | undefined {
  const value = readStringEnv(name, env);
  if (value === undefined) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    throw new ConfigurationError([`${name} must be a valid absolute URL`]);
  }
}

export function readEnumEnv<const T extends readonly string[]>(
  name: string,
  values: T,
  defaultValue: T[number],
  env: Environment = getEnvironment(),
): T[number] {
  const value = readStringEnv(name, env) ?? defaultValue;
  if (!values.includes(value)) {
    throw new ConfigurationError([
      `${name} must be one of ${values.join(', ')}, received "${value}"`,
    ]);
  }
  return value as T[number];
}

export function redactEnvironment(
  env: Environment = getEnvironment(),
): Record<string, string> {
  return Object.fromEntries(ENVIRONMENT_VARIABLES.flatMap((entry) => {
    const value = readStringEnv(entry.name, env);
    if (value === undefined) return [];
    return [[entry.name, entry.secret ? '[REDACTED]' : value]];
  }));
}

export function collectConfiguration<T extends Record<string, unknown>>(
  readers: { [K in keyof T]: () => T[K] },
): T {
  const result: Partial<T> = {};
  const issues: string[] = [];
  for (const [key, reader] of Object.entries(readers) as Array<
    [keyof T, () => T[keyof T]]
  >) {
    try {
      result[key] = reader();
    } catch (error) {
      if (error instanceof ConfigurationError) issues.push(...error.issues);
      else throw error;
    }
  }
  if (issues.length > 0) throw new ConfigurationError(issues);
  return result as T;
}

/** Global log level configuration. */
export function getLogLevel(env: Environment = getEnvironment()): string {
  return readStringEnv('GLMCP_LOG_LEVEL', env) ?? readStringEnv('LOG_LEVEL', env) ?? 'info';
}

/** User-Agent for headless-browser instances. */
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** User-Agent for HTTP client requests (Axios). */
export const HTTP_USER_AGENT = 'Mozilla/5.0 (compatible; German-Legal-MCP/1.0)';
