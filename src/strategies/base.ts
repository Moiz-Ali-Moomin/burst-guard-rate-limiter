export enum RateLimitStrategy {
  FIXED_WINDOW = 'fixed_window',
  SLIDING_WINDOW = 'sliding_window',
  SLIDING_WINDOW_COUNTER = 'sliding_window_counter',
  TOKEN_BUCKET = 'token_bucket',
  HIERARCHICAL = 'hierarchical',
  TIME_BASED = 'time_based',
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  strategy: RateLimitStrategy;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  burstLimit?: number;
  refillRate?: number;
}

export interface IRateLimitStrategy {
  readonly name: RateLimitStrategy;
  isAllowed(options: RateLimitOptions): Promise<RateLimitResult>;
}
