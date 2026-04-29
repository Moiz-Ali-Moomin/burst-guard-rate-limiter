import Redis, { Cluster } from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

let redisClient: Redis | Cluster | null = null;
let redisAvailable = false;

function parseHostPorts(csv: string): Array<{ host: string; port: number }> {
  return csv
    .split(',')
    .map((s) => {
      const [host, portStr] = s.trim().split(':');
      return { host: host.trim(), port: parseInt(portStr || '6379', 10) };
    })
    .filter((n) => n.host);
}

function attachEvents(client: Redis | Cluster): void {
  client.on('connect', () => {
    redisAvailable = true;
    logger.info('Redis connected');
  });
  client.on('ready', () => {
    redisAvailable = true;
    logger.info('Redis ready');
  });
  client.on('error', (err) => {
    redisAvailable = false;
    logger.error({ err }, 'Redis error');
  });
  client.on('close', () => {
    redisAvailable = false;
    logger.warn('Redis connection closed');
  });
  client.on('reconnecting', () => {
    logger.warn('Redis reconnecting');
  });
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    const {
      mode,
      host,
      port,
      password,
      db,
      connectTimeout,
      commandTimeout,
      sentinelName,
      sentinelHosts,
      clusterNodes,
    } = config.redis;

    if (mode === 'cluster') {
      const nodes = parseHostPorts(clusterNodes).length
        ? parseHostPorts(clusterNodes)
        : [{ host, port }];

      const cluster = new Cluster(nodes, {
        redisOptions: { password, connectTimeout, commandTimeout },
        lazyConnect: true,
        clusterRetryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
      });
      attachEvents(cluster);
      redisClient = cluster;
    } else if (mode === 'sentinel') {
      const sentinels = parseHostPorts(sentinelHosts).length
        ? parseHostPorts(sentinelHosts)
        : [{ host: 'localhost', port: 26379 }];

      const sentinel = new Redis({
        sentinels,
        name: sentinelName,
        password,
        db,
        connectTimeout,
        commandTimeout,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
        maxRetriesPerRequest: 1,
      });
      attachEvents(sentinel);
      redisClient = sentinel;
    } else {
      const standalone = new Redis({
        host,
        port,
        password,
        db,
        connectTimeout,
        commandTimeout,
        lazyConnect: true,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 200, 1000);
        },
        maxRetriesPerRequest: 1,
      });
      attachEvents(standalone);
      redisClient = standalone;
    }
  }

  // Both Redis and Cluster implement the same commander interface.
  // Cast to Redis so callers don't need to branch on the union type.
  return redisClient as Redis;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    redisAvailable = false;
  }
}
