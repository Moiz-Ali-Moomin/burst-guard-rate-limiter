export const LUA_HIERARCHICAL_RATE_LIMIT = `
-- Hierarchical Rate Limiting Script
-- This script implements hierarchical rate limiting with parent-child relationships

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- In a real implementation, this would check parent rate limits first
-- then apply child rate limits, etc.

-- For now, this is a placeholder that implements basic sliding window counter logic
-- but in a real implementation it would check the hierarchy

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

export const LUA_TIME_BASED_RATE_LIMIT = `
-- Time-Based Rate Limiting Script
-- This script implements time-based rate limiting with different limits at different times of day

local key = KEYS[1]
local base_limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Get current hour for time-based adjustments
local current_hour = tonumber(ARGV[4]) or 0
local day_of_week = tonumber(ARGV[5]) or 0

-- In a real implementation, this would check the current time and day
-- and adjust the limit accordingly

-- For now, this is a placeholder that implements basic sliding window counter logic
-- but in a real implementation it would adjust limits based on time

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

-- Adjust limit based on time of day (placeholder logic)
local adjusted_limit = base_limit
if current_hour >= 9 and current_hour <= 17 then
  -- Business hours - higher limits
  adjusted_limit = math.floor(base_limit * 1.5)
elseif current_hour >= 0 and current_hour <= 5 then
  -- Off hours - lower limits
  adjusted_limit = math.floor(base_limit * 0.5)
end

if approx_count >= adjusted_limit then
  local retry_after = math.ceil(window_ms - elapsed_ms)
  if retry_after < 0 then retry_after = 0 end
  return {0, 0, retry_after}
end

curr_count = curr_count + 1
redis.call('HMSET', key, 'cw', curr_window, 'cc', curr_count, 'pw', prev_window, 'pc', prev_count)
redis.call('PEXPIRE', key, window_ms * 2)

return {1, adjusted_limit - approx_count - 1, 0}
`;
