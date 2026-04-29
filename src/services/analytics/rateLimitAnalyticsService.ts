import { getRedisClient } from '../../redis/client';
import { logger } from '../../utils/logger';

export interface RateLimitAnalyticsData {
  timestamp: number;
  path: string;
  method: string;
  strategy: string;
  allowed: boolean;
  limit: number;
  remaining: number;
  userId?: string;
  tenantId?: string;
  ip: string;
  userAgent?: string;
}

export interface AnalyticsSummary {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  topPaths: { path: string; count: number }[];
  topUsers: { userId: string; count: number }[];
  topStrategies: { strategy: string; count: number }[];
  hourlyBreakdown: { hour: number; count: number }[];
  blockedByStrategy: { strategy: string; count: number }[];
}

export class RateLimitAnalyticsService {
  private static instance: RateLimitAnalyticsService;
  private analyticsKeyPrefix = 'analytics:';
  private client = getRedisClient();

  private constructor() {}

  public static getInstance(): RateLimitAnalyticsService {
    if (!RateLimitAnalyticsService.instance) {
      RateLimitAnalyticsService.instance = new RateLimitAnalyticsService();
    }
    return RateLimitAnalyticsService.instance;
  }

  public async recordRequest(data: RateLimitAnalyticsData): Promise<void> {
    try {
      const timestamp = Math.floor(Date.now() / 1000); // Current time in seconds

      // Record the request
      const key = `${this.analyticsKeyPrefix}requests:${timestamp}`;
      await this.client.incr(key);
      await this.client.expire(key, 86400); // Expire after 24 hours

      // Record by path
      const pathKey = `${this.analyticsKeyPrefix}path:${data.path}:${timestamp}`;
      await this.client.incr(pathKey);
      await this.client.expire(pathKey, 86400);

      // Record by user
      if (data.userId) {
        const userKey = `${this.analyticsKeyPrefix}user:${data.userId}:${timestamp}`;
        await this.client.incr(userKey);
        await this.client.expire(userKey, 86400);
      }

      // Record by strategy
      const strategyKey = `${this.analyticsKeyPrefix}strategy:${data.strategy}:${timestamp}`;
      await this.client.incr(strategyKey);
      await this.client.expire(strategyKey, 86400);

      // Record blocked requests separately
      if (!data.allowed) {
        const blockedKey = `${this.analyticsKeyPrefix}blocked:${timestamp}`;
        await this.client.incr(blockedKey);
        await this.client.expire(blockedKey, 86400);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to record analytics data');
    }
  }

  public async getAnalyticsSummary(hoursBack: number = 24): Promise<AnalyticsSummary> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const start = now - hoursBack * 3600;

      // Get total requests
      const totalRequests = 0;
      const allowedRequests = 0;
      const blockedRequests = 0;
      const pathCounts: Record<string, number> = {};
      const userCounts: Record<string, number> = {};
      const strategyCounts: Record<string, number> = {};
      const hourlyCounts: Record<number, number> = {};
      const blockedByStrategy: Record<string, number> = {};

      // This is a simplified implementation - in a real implementation,
      // you would query Redis for the actual data
      for (let i = start; i <= now; i++) {
        // In a real implementation, you would aggregate data from Redis
        // This is just a placeholder for the structure
      }

      return {
        totalRequests,
        allowedRequests,
        blockedRequests,
        topPaths: Object.entries(pathCounts)
          .map(([path, count]) => ({ path, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        topUsers: Object.entries(userCounts)
          .map(([userId, count]) => ({ userId, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        topStrategies: Object.entries(strategyCounts)
          .map(([strategy, count]) => ({ strategy, count }))
          .sort((a, b) => b.count - a.count),
        hourlyBreakdown: Object.entries(hourlyCounts)
          .map(([hour, count]) => ({ hour: parseInt(hour), count }))
          .sort((a, b) => a.hour - b.hour),
        blockedByStrategy: Object.entries(blockedByStrategy)
          .map(([strategy, count]) => ({ strategy, count }))
          .sort((a, b) => b.count - a.count),
      };
    } catch (err) {
      logger.error({ err }, 'Failed to get analytics summary');
      return {
        totalRequests: 0,
        allowedRequests: 0,
        blockedRequests: 0,
        topPaths: [],
        topUsers: [],
        topStrategies: [],
        hourlyBreakdown: [],
        blockedByStrategy: [],
      };
    }
  }

  public async getTopRateLimitedPaths(
    _limit: number = 10,
  ): Promise<{ path: string; count: number }[]> {
    // Implementation would query Redis for the most rate-limited paths
    return [];
  }

  public async getUsageRecommendations(): Promise<{
    recommendedLimits: Record<string, number>;
    warnings: string[];
  }> {
    // This would analyze usage patterns and suggest optimal rate limits
    return {
      recommendedLimits: {},
      warnings: [],
    };
  }
}
