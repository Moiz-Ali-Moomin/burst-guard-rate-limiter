/**
 * Fixed Window Counter
 *
 * KEYS[1] = rate limit key
 * ARGV[1] = limit (max requests per window)
 * ARGV[2] = window duration in milliseconds
 * ARGV[3] = current timestamp (unused here, kept for consistency)
 *
 * Returns: {allowed: 0|1, remaining: number, retry_after_ms: number}
 */
export const LUA_FIXED_WINDOW = `
local key    = KEYS[1]
local limit  = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local count = redis.call('GET', key)

if count == false then
  redis.call('SET', key, 1, 'PX', window)
  return {1, limit - 1, window}
end

count = tonumber(count)

if count >= limit then
  local ttl = redis.call('PTTL', key)
  if ttl < 0 then ttl = 0 end
  return {0, 0, ttl}
end

redis.call('INCR', key)
local ttl = redis.call('PTTL', key)
return {1, limit - count - 1, ttl}
`;

/**
 * Sliding Window Log (sorted-set based)
 *
 * KEYS[1]  = rate limit key
 * ARGV[1]  = limit
 * ARGV[2]  = window duration in milliseconds
 * ARGV[3]  = current timestamp (ms since epoch)
 * ARGV[4]  = unique request identifier (uuid)
 *
 * Returns: {allowed: 0|1, remaining: number, retry_after_ms: number}
 */
export const LUA_SLIDING_WINDOW = `
local key        = KEYS[1]
local limit      = tonumber(ARGV[1])
local window_ms  = tonumber(ARGV[2])
local now        = tonumber(ARGV[3])
local req_id     = ARGV[4]

local window_start = now - window_ms

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = window_ms
  if oldest[2] then
    retry_after = window_ms - (now - tonumber(oldest[2]))
    if retry_after < 0 then retry_after = 0 end
  end
  return {0, 0, retry_after}
end

redis.call('ZADD', key, now, req_id)
redis.call('PEXPIRE', key, window_ms)

return {1, limit - count - 1, 0}
`;

/**
 * Sliding Window Counter (approximate)
 *
 * Uses two fixed-window counters stored in a single HASH key.
 * Approximation: count = prev_count * (1 - elapsed/window) + curr_count
 * Memory: O(1) per key (vs O(n) for log-based sliding window).
 *
 * KEYS[1] = rate limit key
 * ARGV[1] = limit
 * ARGV[2] = window duration in milliseconds
 * ARGV[3] = current timestamp (ms since epoch)
 *
 * Returns: {allowed: 0|1, remaining: number, retry_after_ms: number}
 */
export const LUA_SLIDING_WINDOW_COUNTER = `
local key       = KEYS[1]
local limit     = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])

local curr_window = math.floor(now / window_ms)
local prev_window = curr_window - 1

local data = redis.call('HMGET', key, 'cw', 'cc', 'pw', 'pc')

local stored_cw  = tonumber(data[1]) or -1
local curr_count = 0
local prev_count = 0

if stored_cw == curr_window then
  curr_count = tonumber(data[2]) or 0
  if tonumber(data[3]) == prev_window then
    prev_count = tonumber(data[4]) or 0
  end
elseif stored_cw == prev_window then
  prev_count = tonumber(data[2]) or 0
  curr_count = 0
end

local elapsed_ms   = now - (curr_window * window_ms)
local weight       = 1 - (elapsed_ms / window_ms)
local approx_count = math.floor(prev_count * weight + curr_count)

if approx_count >= limit then
  local retry_after = math.ceil(window_ms - elapsed_ms)
  if retry_after < 0 then retry_after = 0 end
  return {0, 0, retry_after}
end

curr_count = curr_count + 1
redis.call('HMSET', key, 'cw', curr_window, 'cc', curr_count, 'pw', prev_window, 'pc', prev_count)
redis.call('PEXPIRE', key, window_ms * 2)

return {1, limit - approx_count - 1, 0}
`;

/**
 * Token Bucket
 *
 * KEYS[1]  = rate limit key
 * ARGV[1]  = bucket capacity (max tokens / burst limit)
 * ARGV[2]  = refill rate (tokens per second)
 * ARGV[3]  = current timestamp in milliseconds
 * ARGV[4]  = tokens requested (typically 1)
 * ARGV[5]  = TTL for the key in milliseconds
 *
 * Returns: {allowed: 0|1, remaining_tokens: number, retry_after_ms: number}
 */
export const LUA_TOKEN_BUCKET = `
local key              = KEYS[1]
local capacity         = tonumber(ARGV[1])
local refill_rate      = tonumber(ARGV[2])
local now              = tonumber(ARGV[3])
local tokens_requested = tonumber(ARGV[4])
local ttl_ms           = tonumber(ARGV[5])

local data        = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens      = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
  tokens      = capacity
  last_refill = now
end

local elapsed_ms    = math.max(0, now - last_refill)
local refill_tokens = (elapsed_ms / 1000) * refill_rate
tokens = math.min(capacity, tokens + refill_tokens)

if tokens < tokens_requested then
  local tokens_needed   = tokens_requested - tokens
  local wait_seconds    = tokens_needed / refill_rate
  local retry_after_ms  = math.ceil(wait_seconds * 1000)

  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
  redis.call('PEXPIRE', key, ttl_ms)

  return {0, math.floor(tokens), retry_after_ms}
end

tokens = tokens - tokens_requested
redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
redis.call('PEXPIRE', key, ttl_ms)

return {1, math.floor(tokens), 0}
`;
