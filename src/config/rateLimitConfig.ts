import { RateLimitStrategy } from '../strategies/base';

export interface RateLimitRule {
  strategy: RateLimitStrategy;
  windowMs: number;
  limit: number;
  burstLimit?: number;
  refillRate?: number;
  keyBy: Array<'ip' | 'user' | 'tenant'>;
}

export interface EndpointConfig {
  path: string;
  method?: string;
  rules: RateLimitRule[];
}

export const endpointConfigs: EndpointConfig[] = [
  {
    path: '/public',
    rules: [
      {
        strategy: RateLimitStrategy.FIXED_WINDOW,
        windowMs: 60_000,
        limit: 100,
        keyBy: ['ip'],
      },
    ],
  },
  {
    path: '/protected',
    rules: [
      {
        strategy: RateLimitStrategy.SLIDING_WINDOW,
        windowMs: 60_000,
        limit: 30,
        keyBy: ['user', 'ip'],
      },
    ],
  },
  {
    path: '/heavy',
    rules: [
      {
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        windowMs: 60_000,
        limit: 10,
        burstLimit: 20,
        refillRate: 0.167,
        keyBy: ['user', 'tenant'],
      },
    ],
  },
  {
    path: '/api',
    rules: [
      {
        strategy: RateLimitStrategy.SLIDING_WINDOW_COUNTER,
        windowMs: 60_000,
        limit: 200,
        keyBy: ['ip'],
      },
    ],
  },
];
