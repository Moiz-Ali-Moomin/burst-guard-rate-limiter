import { TimeBasedRateLimitStrategy } from '../../../src/strategies/time-based/timeBasedRateLimitStrategy';
import { RateLimitStrategy } from '../../../src/strategies/base';

const mockEvalsha = jest.fn();
const mockScript = jest.fn().mockResolvedValue('sha-time-based');

jest.mock('../../../src/redis/client', () => ({
  getRedisClient: () => ({ evalsha: mockEvalsha, script: mockScript }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('TimeBasedRateLimitStrategy', () => {
  let strategy: TimeBasedRateLimitStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new TimeBasedRateLimitStrategy();
  });

  it('has the correct strategy name', () => {
    expect(strategy.name).toBe('time_based' as RateLimitStrategy);
  });

  it('allows request when under the limit', async () => {
    mockEvalsha.mockResolvedValue([1, 9, 55_000]);

    const result = await strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    expect(result.strategy).toBe('time_based');
  });

  it('blocks request when at the limit', async () => {
    mockEvalsha.mockResolvedValue([0, 0, 30_000]);

    const result = await strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBe(30_000);
  });

  it('reloads Lua script on NOSCRIPT error and retries', async () => {
    mockEvalsha
      .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
      .mockResolvedValueOnce([1, 9, 55_000]);

    const result = await strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 });

    expect(mockScript).toHaveBeenCalledTimes(2);
    expect(result.allowed).toBe(true);
  });
});
