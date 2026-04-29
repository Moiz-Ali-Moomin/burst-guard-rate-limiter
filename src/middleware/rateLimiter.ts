import { Request, Response, NextFunction } from 'express';
import { endpointConfigs, RateLimitRule } from '../config/rateLimitConfig';
import { RateLimitResult } from '../strategies/base';
import { rateLimiterService } from '../services/rateLimiterService';
import { setRateLimitHeaders } from '../utils/headers';
import { logger } from '../utils/logger';
import { getDynamicConfigService } from '../services/config/dynamicConfigService';

function findRules(req: Request): RateLimitRule[] {
  // First try to find rules in dynamic configuration
  const dynamicConfigService = getDynamicConfigService();
  const dynamicEndpointConfigs = dynamicConfigService.getEndpointConfigs();

  const dynamicMatch = dynamicEndpointConfigs.find((cfg) => {
    const pathMatch = cfg.path === req.path || req.path.startsWith(cfg.path + '/');
    const methodMatch = !cfg.method || cfg.method.toUpperCase() === req.method.toUpperCase();
    return pathMatch && methodMatch;
  });

  if (dynamicMatch) {
    return dynamicMatch.rules;
  }

  // Fallback to static configuration
  const match = endpointConfigs.find((cfg) => {
    const pathMatch = cfg.path === req.path || req.path.startsWith(cfg.path + '/');
    const methodMatch = !cfg.method || cfg.method.toUpperCase() === req.method.toUpperCase();
    return pathMatch && methodMatch;
  });

  return match?.rules ?? [];
}

export async function rateLimiterMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rules = findRules(req);

  if (rules.length === 0) {
    next();
    return;
  }

  try {
    let mostRestrictive: RateLimitResult | null = null;

    for (const rule of rules) {
      const result = await rateLimiterService.check(req, rule);

      if (!result.allowed) {
        setRateLimitHeaders(res, result);
        logger.info(
          {
            path: req.path,
            strategy: result.strategy,
            ip: req.ip,
            retryAfterMs: result.retryAfterMs,
          },
          'Request rate limited',
        );
        res.status(429).json({
          error: 'Too Many Requests',
          strategy: result.strategy,
          retryAfterMs: result.retryAfterMs,
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        });
        return;
      }

      if (!mostRestrictive || result.remaining < mostRestrictive.remaining) {
        mostRestrictive = result;
      }
    }

    if (mostRestrictive) {
      setRateLimitHeaders(res, mostRestrictive);
    }

    next();
  } catch (err) {
    logger.error({ err, path: req.path }, 'Rate limiter middleware error');
    next(err);
  }
}
