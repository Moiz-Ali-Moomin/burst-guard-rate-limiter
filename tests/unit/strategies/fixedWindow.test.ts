import { FixedWindowStrategy } from '../../../src/strategies/fixed-window/fixedWindowStrategy';
import { RateLimitStrategy } from '../../../src/strategies/base';

const mockEvalsha = jest.fn();
const mockScript = jest.fn().mockResolvedValue('sha-fixed');

jest.mock('../../../src/redis/client', () => ({
  getRedisClient: () => ({ evalsha: mockEvalsha, script: mockScript }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('FixedWindowStrategy', () => {
  let strategy: FixedWindowStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new FixedWindowStrategy();
  });

  it('has the correct strategy name', () => {
    expect(strategy.name).toBe(RateLimitStrategy.FIXED_WINDOW);
  });

  it('allows request when under the limit', async () => {
    mockEvalsha.mockResolvedValue([1, 9, 55_000]);

    const result = await strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    expect(result.retryAfterMs).toBe(55_000);
    expect(result.strategy).toBe(RateLimitStrategy.FIXED_WINDOW);
  });

  it('blocks request when at the limit', async () => {
    mockEvalsha.mockResolvedValue([0, 0, 30_000]);

    const result = await strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBe(30_000);
  });

  it('clamps remaining to zero when value is negative', async () => {
    mockEvalsha.mockResolvedValue([0, -1, 5_000]);

    const result = await strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 });

    expect(result.remaining).toBe(0);
  });

  it('reloads Lua script on NOSCRIPT error and retries', async () => {
    mockEvalsha
      .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
      .mockResolvedValueOnce([1, 9, 55_000]);

    const result = await strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 });

    expect(mockScript).toHaveBeenCalledTimes(2);
    expect(result.allowed).toBe(true);
  });

  it('rethrows non-NOSCRIPT Redis errors', async () => {
    mockEvalsha.mockRejectedValue(new Error('WRONGTYPE Operation'));

    await expect(
      strategy.isAllowed({ key: 'test:key', limit: 10, windowMs: 60_000 }),
    ).rejects.toThrow('WRONGTYPE Operation');
  });

  it('caches the script SHA after first load', async () => {
    mockEvalsha.mockResolvedValue([1, 9, 55_000]);

    await strategy.isAllowed({ key: 'k', limit: 10, windowMs: 60_000 });
    await strategy.isAllowed({ key: 'k', limit: 10, windowMs: 60_000 });

    expect(mockScript).toHaveBeenCalledTimes(1);
  });
});
