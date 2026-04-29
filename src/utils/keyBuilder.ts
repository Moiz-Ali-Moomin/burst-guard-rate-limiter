import { Request } from 'express';
import { RateLimitRule } from '../config/rateLimitConfig';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  tenantId?: string;
}

export function buildKey(req: AuthenticatedRequest, rule: RateLimitRule): string {
  const parts: string[] = [config.rateLimiter.keyPrefix, rule.strategy];

  for (const dimension of rule.keyBy) {
    switch (dimension) {
      case 'ip':
        parts.push('ip', req.ip ?? 'unknown');
        break;
      case 'user':
        parts.push('user', req.userId ?? 'anonymous');
        break;
      case 'tenant':
        parts.push('tenant', req.tenantId ?? 'default');
        break;
    }
  }

  parts.push(req.path.replace(/\//g, '_'));
  return parts.join(':');
}
