import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { RateLimitStrategy } from '../strategies/base';

class MetricsService {
  private readonly registry: Registry;
  private readonly totalRequests: Counter<string>;
  private readonly blockedRequests: Counter<string>;
  private readonly requestLatency: Histogram<string>;
  private readonly redisAvailabilityGauge: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    this.totalRequests = new Counter({
      name: 'rate_limiter_requests_total',
      help: 'Total number of rate limit checks performed',
      labelNames: ['strategy'],
      registers: [this.registry],
    });

    this.blockedRequests = new Counter({
      name: 'rate_limiter_blocked_total',
      help: 'Total number of requests blocked by rate limiter',
      labelNames: ['strategy'],
      registers: [this.registry],
    });

    this.requestLatency = new Histogram({
      name: 'rate_limiter_check_duration_ms',
      help: 'Latency of rate limit checks in milliseconds',
      labelNames: ['strategy'],
      buckets: [1, 2, 5, 10, 25, 50, 100, 250, 500],
      registers: [this.registry],
    });

    this.redisAvailabilityGauge = new Gauge({
      name: 'rate_limiter_redis_available',
      help: 'Whether Redis is currently reachable (1 = yes, 0 = no)',
      registers: [this.registry],
    });
  }

  recordRequest(strategy: RateLimitStrategy, allowed: boolean, latencyMs: number): void {
    this.totalRequests.inc({ strategy });
    if (!allowed) {
      this.blockedRequests.inc({ strategy });
    }
    this.requestLatency.observe({ strategy }, latencyMs);
  }

  setRedisAvailability(available: boolean): void {
    this.redisAvailabilityGauge.set(available ? 1 : 0);
  }

  getRegistry(): Registry {
    return this.registry;
  }
}

export const metricsService = new MetricsService();
