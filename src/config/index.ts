import dotenv from 'dotenv';
import { cleanEnv, str, port, bool, num, host } from 'envalid';
import type { Algorithm } from 'jsonwebtoken';

dotenv.config();

const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  PORT: port({ default: 3000 }),
  REDIS_MODE: str({ choices: ['standalone', 'cluster', 'sentinel'], default: 'standalone' }),
  REDIS_HOST: host({ default: 'localhost' }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str({ default: '' }),
  REDIS_DB: num({ default: 0 }),
  REDIS_CONNECT_TIMEOUT: num({ default: 5000 }),
  REDIS_COMMAND_TIMEOUT: num({ default: 1000 }),
  REDIS_SENTINEL_NAME: str({ default: 'mymaster' }),
  REDIS_SENTINEL_HOSTS: str({ default: '' }),
  REDIS_CLUSTER_NODES: str({ default: '' }),
  RATE_LIMITER_FALLBACK: bool({ default: true }),
  RATE_LIMITER_KEY_PREFIX: str({ default: 'rl' }),
  JWT_SECRET: str({ default: '' }),
  JWT_ALGORITHM: str({ default: 'HS256' }),
  JWT_JWKS_URI: str({ default: '' }),
});

export const config = {
  server: {
    port: env.PORT,
    env: env.NODE_ENV,
  },
  redis: {
    mode: env.REDIS_MODE as 'standalone' | 'cluster' | 'sentinel',
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    connectTimeout: env.REDIS_CONNECT_TIMEOUT,
    commandTimeout: env.REDIS_COMMAND_TIMEOUT,
    sentinelName: env.REDIS_SENTINEL_NAME,
    sentinelHosts: env.REDIS_SENTINEL_HOSTS,
    clusterNodes: env.REDIS_CLUSTER_NODES,
  },
  rateLimiter: {
    fallbackOnRedisFailure: env.RATE_LIMITER_FALLBACK,
    keyPrefix: env.RATE_LIMITER_KEY_PREFIX,
  },
  jwt: {
    secret: env.JWT_SECRET || undefined,
    algorithm: env.JWT_ALGORITHM as Algorithm,
    jwksUri: env.JWT_JWKS_URI || undefined,
  },
};
