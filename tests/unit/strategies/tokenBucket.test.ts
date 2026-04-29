import { TokenBucketStrategy } from '../../../src/strategies/token-bucket/tokenBucketStrategy';
import { RateLimitStrategy } from '../../../src/strategies/base';

const mockEvalsha = jest.fn();
const mockScript = jest.fn().mockResolvedValue('sha-token');

jest.mock('../../../src/redis/client', () => ({
  getRedisClient: () => ({ evalsha: mockEvalsha, script: mockScript }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('TokenBucketStrategy', () => {
  let strategy: TokenBucketStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new TokenBucketStrategy();
  });

  it('has the correct strategy name', () => {
    expect(strategy.name).toBe(RateLimitStrategy.TOKEN_BUCKET);
  });

  it('allows request when tokens are available', async () => {
    mockEvalsha.mockResolvedValue([1, 19, 0]);

    const result = await strategy.isAllowed({
      key: 'tb:key',
      limit: 10,
      windowMs: 60_000,
      burstLimit: 20,
      refillRate: 0.167,
    });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20);
    expect(result.remaining).toBe(19);
    expect(result.strategy).toBe(RateLimitStrategy.TOKEN_BUCKET);
  });

  it('blocks when bucket is empty and returns wait time', async () => {
    mockEvalsha.mockResolvedValue([0, 0, 6_000]);

    const result = await strategy.isAllowed({
      key: 'tb:key',
      limit: 10,
      windowMs: 60_000,
      burstLimit: 20,
      refillRate: 0.167,
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(6_000);
  });

  it('uses burstLimit as capacity when provided', async () => {
    mockEvalsha.mockResolvedValue([1, 14, 0]);

    await strategy.isAllowed({
      key: 'tb:key',
      limit: 10,
      windowMs: 60_000,
      burstLimit: 15,
      refillRate: 2,
    });

    expect(mockEvalsha).toHaveBeenCalledWith(
      'sha-token',
      1,
      'tb:key',
      15,
      2,
      expect.any(Number),
      1,
      120_000,
    );
  });

  it('derives refill rate from limit/window when refillRate not provided', async () => {
    mockEvalsha.mockResolvedValue([1, 9, 0]);

    await strategy.isAllowed({ key: 'tb:key', limit: 10, windowMs: 60_000 });

    const callArgs = mockEvalsha.mock.calls[0];
    const passedRate = callArgs[4];
    expect(passedRate).toBeCloseTo(10 / 60, 5);
  });

  it('reloads script on NOSCRIPT and retries', async () => {
    mockEvalsha
      .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
      .mockResolvedValueOnce([1, 5, 0]);

    const result = await strategy.isAllowed({ key: 'tb:key', limit: 10, windowMs: 60_000 });

    expect(mockScript).toHaveBeenCalledTimes(2);
    expect(result.allowed).toBe(true);
  });
});
