import { Response } from 'express';
import { RateLimitResult } from '../strategies/base';

export function setRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
  res.setHeader('X-RateLimit-Strategy', result.strategy);

  if (!result.allowed && result.retryAfterMs > 0) {
    const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    res.setHeader('X-RateLimit-Reset', Date.now() + result.retryAfterMs);
  }
}
