import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upstash: {
    get: vi.fn(), set: vi.fn(), del: vi.fn(), hset: vi.fn(), hgetall: vi.fn(), scan: vi.fn(),
  },
  tcp: {
    get: vi.fn(), set: vi.fn(), del: vi.fn(), hset: vi.fn(), hgetall: vi.fn(), scan: vi.fn(), quit: vi.fn(),
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: class { constructor() { return mocks.upstash; } },
}));

vi.mock('ioredis', () => ({
  Redis: class { constructor() { return mocks.tcp; } },
}));

import { createRedisClient } from './redis-client.js';

describe('shared Redis client adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adapts Upstash REST values and operations', async () => {
    mocks.upstash.get
      .mockResolvedValueOnce('plain')
      .mockResolvedValueOnce({ nested: true })
      .mockResolvedValueOnce(null);
    mocks.upstash.set.mockResolvedValue('OK');
    mocks.upstash.del.mockResolvedValue(2);
    mocks.upstash.hset.mockResolvedValue(1);
    mocks.upstash.hgetall
      .mockResolvedValueOnce({ string: 'value', object: { n: 1 } })
      .mockResolvedValueOnce({});
    mocks.upstash.scan.mockResolvedValue([0, ['alpha:doc:1']]);

    const client = await createRedisClient({
      redisUpstashUrl: 'https://redis.example.test',
      redisUpstashToken: 'token',
    }, 'redis-test');

    await expect(client.get('a')).resolves.toBe('plain');
    await expect(client.get('b')).resolves.toBe('{"nested":true}');
    await expect(client.get('c')).resolves.toBeNull();
    await client.set('a', 'value');
    await client.del('a', 'b');
    await client.hset('idx', 'a', 'meta');
    await expect(client.hgetall('idx')).resolves.toEqual({
      string: 'value', object: '{"n":1}',
    });
    await expect(client.hgetall('empty')).resolves.toBeNull();
    await expect(client.scan(0, { match: 'alpha:*', count: 100 })).resolves
      .toEqual(['0', ['alpha:doc:1']]);
    expect(mocks.upstash.hset).toHaveBeenCalledWith('idx', { a: 'meta' });
  });

  it('adapts ioredis TCP operations and shutdown', async () => {
    mocks.tcp.get.mockResolvedValue('value');
    mocks.tcp.set.mockResolvedValue('OK');
    mocks.tcp.del.mockResolvedValue(1);
    mocks.tcp.hset.mockResolvedValue(1);
    mocks.tcp.hgetall
      .mockResolvedValueOnce({ a: 'meta' })
      .mockResolvedValueOnce({});
    mocks.tcp.scan.mockResolvedValue(['0', ['beta:doc:1']]);
    mocks.tcp.quit.mockResolvedValue('OK');

    const client = await createRedisClient({ redisUrl: 'redis://localhost:6379' }, 'redis-test');
    await expect(client.get('a')).resolves.toBe('value');
    await client.set('a', 'value');
    await client.del('a');
    await client.hset('idx', 'a', 'meta');
    await expect(client.hgetall('idx')).resolves.toEqual({ a: 'meta' });
    await expect(client.hgetall('empty')).resolves.toBeNull();
    await expect(client.scan(0, { match: 'beta:*', count: 50 })).resolves
      .toEqual(['0', ['beta:doc:1']]);
    await client.quit?.();
    expect(mocks.tcp.scan).toHaveBeenCalledWith(0, 'MATCH', 'beta:*', 'COUNT', 50);
    expect(mocks.tcp.quit).toHaveBeenCalledOnce();
  });

  it('rejects missing Redis configuration', async () => {
    await expect(createRedisClient({}, 'redis-test')).rejects.toThrow('No Redis configuration');
  });
});
