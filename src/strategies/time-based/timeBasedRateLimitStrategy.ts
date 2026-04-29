import { IRateLimitStrategy, RateLimitOptions, RateLimitResult, RateLimitStrategy } from '../base';
import { getRedisClient } from '../../redis/client';
import { LUA_TIME_BASED_RATE_LIMIT } from '../../redis/advancedLuaScripts';
import { logger } from '../../utils/logger';

export class TimeBasedRateLimitStrategy implements IRateLimitStrategy {
  readonly name = 'time_based' as RateLimitStrategy;
  private scriptSha: string | null = null;

  private async loadScript(): Promise<string> {
    if (this.scriptSha) return this.scriptSha;
    const client = getRedisClient();
    this.scriptSha = (await client.script('LOAD', LUA_TIME_BASED_RATE_LIMIT)) as string;
    return this.scriptSha;
  }

  async isAllowed(options: RateLimitOptions): Promise<RateLimitResult> {
    return this._exec(options, false);
  }

  private async _exec(options: RateLimitOptions, retried: boolean): Promise<RateLimitResult> {
    const { key, limit, windowMs } = options;
    const now = Date.now();
    const client = getRedisClient();

    try {
      const sha = await this.loadScript();
      const result = (await client.evalsha(sha, 1, key, limit, windowMs, now)) as [
        number,
        number,
        number,
      ];

      return {
        allowed: result[0] === 1,
        limit,
        remaining: Math.max(0, result[1]),
        retryAfterMs: result[2],
        strategy: this.name,
      };
    } catch (err: unknown) {
      if (!retried && err instanceof Error && err.message.includes('NOSCRIPT')) {
        this.scriptSha = null;
        return this._exec(options, true);
      }
      logger.error({ err, key }, 'TimeBasedRateLimitStrategy error');
      throw err;
    }
  }
}
