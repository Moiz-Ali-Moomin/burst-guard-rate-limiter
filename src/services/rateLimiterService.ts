import { Request } from 'express';
import { IRateLimitStrategy, RateLimitResult, RateLimitStrategy } from '../strategies/base';
import { FixedWindowStrategy } from '../strategies/fixed-window/fixedWindowStrategy';
import { SlidingWindowStrategy } from '../strategies/sliding-window/slidingWindowStrategy';
import { SlidingWindowCounterStrategy } from '../strategies/sliding-window-counter/slidingWindowCounterStrategy';
import { TokenBucketStrategy } from '../strategies/token-bucket/tokenBucketStrategy';
import { HierarchicalRateLimitStrategy } from '../strategies/hierarchical/hierarchicalRateLimitStrategy';
import { TimeBasedRateLimitStrategy } from '../strategies/time-based/timeBasedRateLimitStrategy';
import { RateLimitRule } from '../config/rateLimitConfig';
import { isRedisAvailable } from '../redis/client';
import { config } from '../config';
import { buildKey, AuthenticatedRequest } from '../utils/keyBuilder';
import { metricsService } from './metricsService';
import { logger } from '../utils/logger';
import { RateLimitAnalyticsService } from '../services/analytics/rateLimitAnalyticsService';

class RateLimiterService {
  private readonly strategies: Map<RateLimitStrategy, IRateLimitStrategy>;

  constructor() {
    const entries: Array<[RateLimitStrategy, IRateLimitStrategy]> = [
      [RateLimitStrategy.FIXED_WINDOW, new FixedWindowStrategy()],
      [RateLimitStrategy.SLIDING_WINDOW, new SlidingWindowStrategy()],
      [RateLimitStrategy.SLIDING_WINDOW_COUNTER, new SlidingWindowCounterStrategy()],
      [RateLimitStrategy.TOKEN_BUCKET, new TokenBucketStrategy()],
      [RateLimitStrategy.HIERARCHICAL, new HierarchicalRateLimitStrategy()],
      [RateLimitStrategy.TIME_BASED, new TimeBasedRateLimitStrategy()],
    ];
    this.strategies = new Map(entries);
  }

  async check(req: Request, rule: RateLimitRule): Promise<RateLimitResult> {
    const start = Date.now();
    const authedReq = req as AuthenticatedRequest;

    if (!isRedisAvailable()) {
      if (config.rateLimiter.fallbackOnRedisFailure) {
        logger.warn({ path: req.path }, 'Redis unavailable — failing open');
        return this.buildPassthroughResult(rule);
      }
      throw new Error('Redis unavailable and fail-open is disabled');
    }

    const strategy = this.strategies.get(rule.strategy);
    if (!strategy) throw new Error(`Unknown strategy: ${rule.strategy}`);

    const key = buildKey(authedReq, rule);

    try {
      const result = await strategy.isAllowed({
        key,
        limit: rule.limit,
        windowMs: rule.windowMs,
        burstLimit: rule.burstLimit,
        refillRate: rule.refillRate,
      });

      const latencyMs = Date.now() - start;
      metricsService.recordRequest(rule.strategy, result.allowed, latencyMs);
      metricsService.setRedisAvailability(true);

      // Record analytics data
      const analyticsService = RateLimitAnalyticsService.getInstance();
      await analyticsService.recordRequest({
        timestamp: Date.now(),
        path: req.path,
        method: req.method,
        strategy: rule.strategy,
        allowed: result.allowed,
        limit: rule.limit,
        remaining: result.remaining,
        userId: authedReq.userId,
        tenantId: authedReq.tenantId,
        ip: req.ip || 'unknown',
      });

      return result;
    } catch (err) {
      logger.error({ err, key, strategy: rule.strategy }, 'Rate limiter check failed');
      metricsService.setRedisAvailability(false);

      if (config.rateLimiter.fallbackOnRedisFailure) {
        return this.buildPassthroughResult(rule);
      }
      throw err;
    }
  }

  private buildPassthroughResult(rule: RateLimitRule): RateLimitResult {
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit,
      retryAfterMs: 0,
      strategy: rule.strategy,
    };
  }
}

export const rateLimiterService = new RateLimiterService();
