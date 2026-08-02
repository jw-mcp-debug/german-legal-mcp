import { rootLogger } from './logger.js';

export interface RedisConfiguration {
  redisUpstashUrl?: string | undefined;
  redisUpstashToken?: string | undefined;
  redisUrl?: string | undefined;
}

/** Minimal interface shared by the Upstash REST and ioredis TCP adapters. */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string> | null>;
  scan(cursor: number, opts: { match: string; count: number }): Promise<[string, string[]]>;
  quit?(): Promise<unknown>;
}

export async function createRedisClient(
  config: RedisConfiguration,
  module: string,
): Promise<RedisClient> {
  const logger = rootLogger.child({ module });
  if (config.redisUpstashUrl && config.redisUpstashToken) {
    const { Redis } = await import('@upstash/redis');
    const client = new Redis({
      url: config.redisUpstashUrl,
      token: config.redisUpstashToken,
    });
    logger.info('Using Upstash Redis (REST)');
    return {
      get: async (key) => {
        const result = await client.get(key);
        if (result === null || result === undefined) return null;
        return typeof result === 'string' ? result : JSON.stringify(result);
      },
      set: (key, value) => client.set(key, value),
      del: (...keys) => client.del(...keys),
      hset: (key, field, value) => client.hset(key, { [field]: value }),
      hgetall: async (key) => {
        const result = await client.hgetall(key) as Record<string, unknown> | null;
        if (!result || Object.keys(result).length === 0) return null;
        return Object.fromEntries(Object.entries(result).map(([field, value]) => [
          field,
          typeof value === 'string' ? value : JSON.stringify(value),
        ]));
      },
      scan: async (cursor, opts) => {
        const result = await client.scan(cursor, { match: opts.match, count: opts.count });
        return [String(result[0]), result[1] as string[]];
      },
    };
  }

  if (config.redisUrl) {
    const { Redis } = await import('ioredis');
    const client = new Redis(config.redisUrl);
    logger.info('Using ioredis (TCP)');
    return {
      get: (key) => client.get(key),
      set: (key, value) => client.set(key, value),
      del: (...keys) => client.del(...keys),
      hset: (key, field, value) => client.hset(key, field, value),
      hgetall: (key) => client.hgetall(key).then((result) => (
        Object.keys(result).length > 0 ? result : null
      )),
      scan: async (cursor, opts) => {
        const [next, keys] = await client.scan(
          cursor,
          'MATCH', opts.match,
          'COUNT', opts.count,
        );
        return [String(next), keys];
      },
      quit: () => client.quit(),
    };
  }

  throw new Error('No Redis configuration found');
}
