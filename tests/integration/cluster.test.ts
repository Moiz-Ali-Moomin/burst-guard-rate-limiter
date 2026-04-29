/**
 * Redis Cluster integration tests.
 *
 * Prerequisites:
 *   docker compose --profile cluster up -d
 *   REDIS_CLUSTER_TEST=1 npx jest tests/integration/cluster.test.ts
 *
 * The suite is skipped unless REDIS_CLUSTER_TEST=1 so that regular
 * `npm test` does not require a running cluster.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { Cluster, Redis } from 'ioredis';
import { createHash } from 'node:crypto';

const RUN = process.env.REDIS_CLUSTER_TEST === '1';
const maybeDescribe = RUN ? describe : describe.skip;

const CLUSTER_NODES = (
  process.env.REDIS_CLUSTER_NODES ?? '127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003'
)
  .split(',')
  .map((n) => {
    const [host, port] = n.trim().split(':');
    return { host, port: parseInt(port, 10) };
  });

maybeDescribe('Redis Cluster integration', () => {
  let cluster: Cluster;

  beforeAll(async () => {
    cluster = new Cluster(CLUSTER_NODES, {
      clusterRetryStrategy: (times) => Math.min(200 * times, 1000),
      redisOptions: { connectTimeout: 5000, commandTimeout: 2000 },
    });

    await new Promise<void>((resolve, reject) => {
      cluster.once('ready', resolve);
      cluster.once('error', reject);
      setTimeout(() => reject(new Error('Cluster connect timeout')), 10_000);
    });
  });

  afterAll(async () => {
    await cluster.quit();
  });

  it('connects to the 3-node cluster', async () => {
    const pong = await cluster.ping();
    expect(pong).toBe('PONG');
  });

  it('distributes keys across slots', async () => {
    await cluster.set('test:slot:a', '1', 'EX', 60);
    await cluster.set('test:slot:b', '2', 'EX', 60);
    await cluster.set('test:slot:c', '3', 'EX', 60);

    expect(await cluster.get('test:slot:a')).toBe('1');
    expect(await cluster.get('test:slot:b')).toBe('2');
    expect(await cluster.get('test:slot:c')).toBe('3');
  });

  it('executes Lua scripts via EVALSHA across the cluster', async () => {
    // In cluster mode each EVALSHA key must map to a single slot
    const script = `
      local v = redis.call('INCR', KEYS[1])
      redis.call('EXPIRE', KEYS[1], 60)
      return v
    `;
    const sha = (await cluster.call('SCRIPT', 'LOAD', script)) as string;
    expect(sha).toHaveLength(40);

    const key = 'test:lua:{counter}';
    await cluster.del(key);

    const r1 = await cluster.evalsha(sha, 1, key);
    const r2 = await cluster.evalsha(sha, 1, key);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  it('handles NOSCRIPT by reloading and retrying', async () => {
    const nodes = cluster.nodes('master') as Redis[];
    await Promise.all(nodes.map((n) => n.call('SCRIPT', 'FLUSH')));

    const script = `return 'ok'`;
    const sha = createHash('sha1').update(script).digest('hex');

    let noscriptSeen = false;
    try {
      await cluster.evalsha(sha, 0);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('NOSCRIPT')) {
        noscriptSeen = true;
      }
    }
    expect(noscriptSeen).toBe(true);

    // Reload and retry — mirrors the depth-guarded strategy behaviour
    const reloaded = (await cluster.call('SCRIPT', 'LOAD', script)) as string;
    expect(reloaded).toBe(sha);
    const result = await cluster.evalsha(sha, 0);
    expect(result).toBe('ok');
  });

  it('rate-limit strategy works end-to-end against the cluster', async () => {
    process.env.REDIS_MODE = 'cluster';
    process.env.REDIS_CLUSTER_NODES = CLUSTER_NODES.map((n) => `${n.host}:${n.port}`).join(',');

    jest.resetModules();
    const { connectRedis, disconnectRedis } =
      require('../../src/redis/client') as typeof import('../../src/redis/client');
    await connectRedis();

    const { FixedWindowStrategy } =
      require('../../src/strategies/fixed-window/fixedWindowStrategy') as typeof import('../../src/strategies/fixed-window/fixedWindowStrategy');
    const strategy = new FixedWindowStrategy();

    // Hash-tagged key keeps all operations on a single slot
    const result = await strategy.isAllowed({
      key: 'rl:fixed_window:ip:{127.0.0.1}:_cluster_test',
      limit: 5,
      windowMs: 60_000,
    });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.strategy).toBe('fixed_window');

    await disconnectRedis();
    delete process.env.REDIS_MODE;
    delete process.env.REDIS_CLUSTER_NODES;
  });
});
