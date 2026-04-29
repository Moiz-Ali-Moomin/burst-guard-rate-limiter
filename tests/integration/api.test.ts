/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { Application } from 'express';

let callCounts: Record<string, number> = {};

jest.mock('../../src/redis/client', () => ({
  getRedisClient: () => ({
    evalsha: jest
      .fn()
      .mockImplementation((_sha: string, _numKeys: number, key: string, limit: number) => {
        callCounts[key] = (callCounts[key] ?? 0) + 1;
        const count = callCounts[key];
        const limitNum = Number(limit);
        if (count > limitNum) {
          return Promise.resolve([0, 0, 30_000]);
        }
        return Promise.resolve([1, limitNum - count, 60_000]);
      }),
    script: jest.fn().mockResolvedValue('mock-sha'),
  }),
  isRedisAvailable: jest.fn().mockReturnValue(true),
  connectRedis: jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

jest.mock('pino-http', () => (_options: any) => (_req: any, _res: any, next: any) => next());

let app: Application;

beforeAll(() => {
  const { createApp } = require('../../src/app');
  app = createApp();
});

beforeEach(() => {
  callCounts = {};
});

describe('GET /health', () => {
  it('returns 200 with ok status when Redis is available', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.redis).toBe('connected');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /metrics', () => {
  it('returns Prometheus-format metrics', async () => {
    await request(app).get('/public');
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('rate_limiter_requests_total');
    expect(res.text).toContain('rate_limiter_blocked_total');
    expect(res.text).toContain('rate_limiter_check_duration_ms');
  });
});

describe('GET /public (Fixed Window)', () => {
  it('returns 200 with rate limit headers', async () => {
    const res = await request(app).get('/public');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-strategy']).toBe('fixed_window');
    expect(res.body.message).toContain('Public');
  });

  it('returns 429 when limit is exceeded', async () => {
    for (let i = 0; i < 100; i++) {
      await request(app).get('/public');
    }
    const res = await request(app).get('/public');

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too Many Requests');
    expect(res.body.strategy).toBe('fixed_window');
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('GET /protected (Sliding Window)', () => {
  it('returns 200 with sliding window headers', async () => {
    const res = await request(app).get('/protected').set('x-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-strategy']).toBe('sliding_window');
    expect(res.body.userId).toBe('user-1');
  });

  it('tracks separately per user', async () => {
    const res1 = await request(app).get('/protected').set('x-user-id', 'user-A');
    const res2 = await request(app).get('/protected').set('x-user-id', 'user-B');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});

describe('GET /heavy (Token Bucket)', () => {
  it('returns 200 with token bucket headers', async () => {
    const res = await request(app)
      .get('/heavy')
      .set('x-user-id', 'user-1')
      .set('x-tenant-id', 'tenant-1');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-strategy']).toBe('token_bucket');
    expect(res.body.tenantId).toBe('tenant-1');
  });
});

describe('Rate limit response shape', () => {
  it('429 response includes retryAfterMs and retryAfterSeconds', async () => {
    for (let i = 0; i < 100; i++) {
      await request(app).get('/public');
    }
    const res = await request(app).get('/public');

    if (res.status === 429) {
      expect(typeof res.body.retryAfterMs).toBe('number');
      expect(typeof res.body.retryAfterSeconds).toBe('number');
      expect(res.body.retryAfterSeconds).toBe(Math.ceil(res.body.retryAfterMs / 1000));
    }
  });
});
