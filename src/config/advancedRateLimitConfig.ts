export interface HierarchicalRateLimitRule {
  id: string;
  name: string;
  strategy: string;
  windowMs: number;
  limit: number;
  priority: number;
  conditions: RateLimitCondition[];
  timeBasedRules?: TimeBasedRule[];
  burstLimit?: number;
  refillRate?: number;
  keyBy: Array<'ip' | 'user' | 'tenant'>;
}

export interface TimeBasedRule {
  startTime: string; // e.g., "09:00"
  endTime: string; // e.g., "17:00"
  limitMultiplier: number; // e.g., 2.0 for 2x the normal limit
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
}

export interface RateLimitCondition {
  type: 'header' | 'query' | 'body' | 'ipRange' | 'userAgent';
  key: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  value: string | RegExp;
}

export interface AdaptiveRateLimitConfig {
  enabled: boolean;
  strategy: 'increase' | 'decrease' | 'maintain';
  threshold: number; // Percentage of allowed requests
  adjustmentFactor: number; // How much to adjust by
  minLimit: number;
  maxLimit: number;
  cooldownPeriodMs: number; // Time before next adjustment
}
