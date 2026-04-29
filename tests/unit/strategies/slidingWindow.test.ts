import { SlidingWindowStrategy } from '../../../src/strategies/sliding-window/slidingWindowStrategy';
import { RateLimitStrategy } from '../../../src/strategies/base';

const mockEvalsha = jest.fn();
const mockScript = jest.fn().mockResolvedValue('sha-sliding');

jest.mock('node:crypto', () => ({
  randomUUID: () => 'fixed-test-uuid',
}));

jest.mock('../../../src/redis/client', () => ({
  getRedisClient: () => ({ evalsha: mockEvalsha, script: mockScript }),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

describe('SlidingWindowStrategy', () => {
  let strategy: SlidingWindowStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new SlidingWindowStrategy();
  });

  it('has the correct strategy name', () => {
    expect(strategy.name).toBe(RateLimitStrategy.SLIDING_WINDOW);
  });

  it('allows request within the window', async () => {
    mockEvalsha.mockResolvedValue([1, 29, 0]);

    const result = await strategy.isAllowed({ key: 'sw:key', limit: 30, windowMs: 60_000 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
    expect(result.retryAfterMs).toBe(0);
    expect(result.strategy).toBe(RateLimitStrategy.SLIDING_WINDOW);
  });

  it('blocks and returns time until oldest request expires', async () => {
    mockEvalsha.mockResolvedValue([0, 0, 15_000]);

    const result = await strategy.isAllowed({ key: 'sw:key', limit: 30, windowMs: 60_000 });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(15_000);
  });

  it('passes uuid as request identifier to Lua script', async () => {
    mockEvalsha.mockResolvedValue([1, 1, 0]);

    await strategy.isAllowed({ key: 'sw:key', limit: 2, windowMs: 60_000 });

    expect(mockEvalsha).toHaveBeenCalledWith(
      'sha-sliding',
      1,
      'sw:key',
      2,
      60_000,
      expect.any(Number),
      'fixed-test-uuid',
    );
  });

  it('reloads script on NOSCRIPT and retries', async () => {
    mockEvalsha
      .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
      .mockResolvedValueOnce([1, 5, 0]);

    const result = await strategy.isAllowed({ key: 'sw:key', limit: 10, windowMs: 60_000 });

    expect(mockScript).toHaveBeenCalledTimes(2);
    expect(result.allowed).toBe(true);
  });
});
