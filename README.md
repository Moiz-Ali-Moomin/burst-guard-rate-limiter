# Distributed Rate Limiter

A production-grade, horizontally scalable rate limiting service built with **Node.js**, **TypeScript**, **Redis**, and **Lua scripts**. Supports multiple independent algorithms selectable per endpoint, with full observability, graceful degradation, and Docker-based deployment.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Algorithms — Tradeoffs](#algorithms--tradeoffs)
4. [Distributed Correctness](#distributed-correctness)
5. [API Reference](#api-reference)
6. [Observability](#observability)
7. [Resilience & Failure Scenarios](#resilience--failure-scenarios)
8. [Scaling Strategy](#scaling-strategy)
9. [When to Use Each Algorithm](#when-to-use-each-algorithm)
10. [Getting Started](#getting-started)
11. [Running Tests](#running-tests)
12. [Benchmarking](#benchmarking)
13. [Sample curl Requests](#sample-curl-requests)
14. [Advanced Features](#advanced-features)

---

## Project Overview

Rate limiting is a foundational reliability primitive. Without it, a single misbehaving client can exhaust your service capacity, cascading failures across your entire infrastructure. This project implements a **standalone rate limiting service** that can be composed in front of any backend.

**Key properties:**

- Multiple algorithms with different latency, accuracy, and memory tradeoffs
- Redis as the single source of truth — all app replicas share state
- Lua scripts ensure each check is atomic — no race conditions under concurrent load
- Fail-open by default — a Redis outage degrades gracefully rather than taking your API down
- Prometheus metrics on every operation — block rate, latency percentiles, Redis health
- **Production-hardened Security**: Helmet-secured headers, CORS support, and robust environment validation
- **Continuous Integration**: Automated testing and linting via GitHub Actions
- Per-IP, per-user, and per-tenant key namespacing out of the box
- Dynamic configuration loading from external files
- Analytics and reporting capabilities
- Web-based configuration interface
- Advanced rate limiting policies (hierarchical, time-based)

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   HTTP Request                        │
└──────────────────────┬───────────────────────────────┘
                       │
             ┌─────────▼──────────┐
             │  jwtAuthMiddleware  │
             │  (verifies JWT or   │
             │   trusts x-user-id  │
             │   headers in dev)   │
             └─────────┬──────────┘
                       │
             ┌─────────▼──────────┐
             │ rateLimiterMiddleware│
             │  (finds rules for path)│
             └─────────┬──────────┘
                       │
             ┌─────────▼──────────┐
             │  RateLimiterService  │
             │  (checks Redis up,   │
             │   builds key,        │
             │   invokes strategy)  │
             └─────────┬──────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌─────▼──────┐ ┌───▼───────────┐
│ FixedWindow  │ │ Sliding    │ │ TokenBucket   │
│ Strategy     │ │ Window     │ │ Strategy      │
│              │ │ Strategy   │ │               │
└───────┬──────┘ └─────┬──────┘ └───┬───────────┘
        │              │             │
        └──────────────┼─────────────┘
                       │
             ┌─────────▼──────────┐
             │     Redis           │
             │  (Lua script eval)  │
             └────────────────────┘
```

### Directory Structure

```
src/
├── app.ts                    # Express app factory (middleware + routes)
├── server.ts                 # HTTP server bootstrap
├── index.ts                  # Library entrypoint
├── config/
│   ├── index.ts                    # Environment variable parsing (envalid)
│   ├── rateLimitConfig.ts          # Per-endpoint rule definitions
│   └── advancedRateLimitConfig.ts  # Hierarchical / time-based policies
├── controllers/
│   ├── exampleController.ts    # /public, /protected, /heavy, /api routes
│   ├── healthController.ts     # /health
│   ├── metricsController.ts    # /metrics (Prometheus)
│   ├── analyticsController.ts  # /analytics/* reporting endpoints
│   └── configController.ts     # /config-ui dynamic rule management
├── middleware/
│   ├── auth.ts               # JWT verification (HS256 secret or JWKS)
│   ├── rateLimiter.ts        # Request interception + rule lookup
│   └── errorHandler.ts       # Global error handler
├── services/
│   ├── rateLimiterService.ts # Strategy dispatch + fallback logic
│   ├── metricsService.ts     # Prometheus counter/histogram/gauge
│   ├── analytics/            # Usage tracking + reporting
│   └── config/               # Dynamic rule loading + validation
├── strategies/
│   ├── base.ts               # IRateLimitStrategy interface + types
│   ├── fixed-window/
│   │   └── fixedWindowStrategy.ts
│   ├── sliding-window/
│   │   └── slidingWindowStrategy.ts
│   └── token-bucket/
│       └── tokenBucketStrategy.ts
├── redis/
│   ├── client.ts             # ioredis singleton — standalone, sentinel, cluster
│   └── luaScripts.ts         # All three Lua scripts
└── utils/
    ├── keyBuilder.ts         # Namespaced Redis key construction
    ├── headers.ts            # X-RateLimit-* response headers
    └── logger.ts             # Pino structured logger
```

---

## Algorithms — Tradeoffs

### 1. Fixed Window Counter

**How it works:** Divide time into fixed buckets (e.g., 0–60s, 60–120s). Each request increments the counter for the current bucket. Reset the counter at window boundary.

**Redis structure:** `STRING` — a single integer with a TTL.

**Pros:**
- O(1) time and space per check
- Simplest to reason about
- Lowest Redis memory usage

**Cons:**
- **Boundary burst problem.** A client can send `2×limit` requests in a short window by exploiting the reset: `limit` requests at the end of window N, then `limit` requests immediately at the start of window N+1. Both are "allowed" despite occurring within seconds of each other.
- Not suitable for APIs where smooth traffic distribution matters.

**Best for:** High-throughput public endpoints, API key quotas, cases where occasional bursts at window boundaries are acceptable.

---

### 2. Sliding Window (Log-based)

**How it works:** Maintain a sorted set of timestamps for each client. On each request, remove entries older than `now - windowMs`, count remaining entries, and add the new timestamp if under the limit.

**Redis structure:** `ZSET` — sorted by timestamp, one entry per request.

**Pros:**
- Accurate: no boundary burst problem. The window truly slides.
- Retry-After is precise: exactly how long until the oldest request drops out of the window.

**Cons:**
- **Memory scales with request volume.** A client making 1000 req/min stores 1000 entries in the sorted set.
- Slightly higher Redis CPU for ZREMRANGEBYSCORE + ZADD + ZCARD + PEXPIRE.
- Not appropriate for very high throughput (>10k req/min per key) without memory caps.

**Best for:** User-facing APIs where fairness matters, authenticated endpoints with known client behavior, APIs that must prevent burst abuse.

---

### 3. Token Bucket

**How it works:** Each key has a bucket with capacity `burstLimit`. Tokens are added at `refillRate` per second (up to capacity). Each request consumes one token. If the bucket is empty, the request is denied.

**Redis structure:** `HASH` with two fields: `tokens` (current count) and `last_refill` (timestamp).

**Pros:**
- **Naturally handles bursts.** A client that's been idle accumulates tokens up to capacity, then can spend them in a short burst — modeling real-world traffic patterns.
- Configurable: separate `limit` (sustained rate) and `burstLimit` (peak capacity).
- O(1) space — only two fields per key regardless of request volume.

**Cons:**
- Slightly more complex Lua script (requires float arithmetic for refill).
- Clients may experience a "bursty" service feel if they're allowed large bursts.
- The sustained rate is approximate due to floating-point accumulation over time.

**Best for:** APIs that need to allow short legitimate bursts (mobile clients reconnecting, batch operations) while still enforcing sustained limits. Ideal for `/heavy` or compute-expensive endpoints.

---

## Distributed Correctness

All three algorithms execute as **atomic Lua scripts inside Redis**. This is the critical design decision.

**Why Lua?** Redis executes Lua scripts atomically — no other command can interleave between the read and write inside the script. Without this, two concurrent requests could both read `count=9`, both decide it's under the limit of 10, and both increment — resulting in `count=11` with two requests incorrectly allowed.

**EVALSHA pattern:** Scripts are loaded once via `SCRIPT LOAD` (which returns a SHA digest). Subsequent calls use `EVALSHA` — faster than `EVAL` since Redis doesn't parse the Lua source each time. On a Redis restart (which clears the script cache), the `NOSCRIPT` error triggers an automatic reload and retry.

**Key namespacing:**
```
{prefix}:{strategy}:{dimension}:{value}:...:{path}
```
Example: `rl:sliding_window:user:alice:ip:192.168.1.1:_protected`

This allows fine-grained independent counters across any combination of dimensions without collision.

---

## API Reference

### Rate-Limited Endpoints

| Endpoint     | Algorithm      | Limit       | Key Dimensions  |
|-------------|---------------|-------------|----------------|
| `GET /public`    | Fixed Window  | 100 req/min | IP              |
| `GET /protected` | Sliding Window| 30 req/min  | User + IP       |
| `GET /heavy`     | Token Bucket  | 10/min sustained, burst 20 | User + Tenant |

### Response Headers (all limited endpoints)

| Header                  | Value                                      |
|------------------------|--------------------------------------------|
| `X-RateLimit-Limit`    | Maximum requests allowed in window         |
| `X-RateLimit-Remaining`| Requests remaining in current window       |
| `X-RateLimit-Strategy` | Algorithm in use (`fixed_window`, etc.)    |
| `Retry-After`          | Seconds until the client may retry (429 only) |
| `X-RateLimit-Reset`    | Unix timestamp (ms) when limit resets (429 only) |

### HTTP 429 Response Body

```json
{
  "error": "Too Many Requests",
  "strategy": "sliding_window",
  "retryAfterMs": 15000,
  "retryAfterSeconds": 15
}
```

### System Endpoints

| Endpoint    | Description                             |
|------------|-----------------------------------------|
| `GET /health`  | Redis connectivity + uptime            |
| `GET /metrics` | Prometheus-format metrics              |

---

## Observability

Metrics are exposed in Prometheus text format at `GET /metrics`.

| Metric                              | Type      | Labels     | Description                         |
|------------------------------------|-----------|------------|-------------------------------------|
| `rate_limiter_requests_total`      | Counter   | `strategy` | All rate limit checks               |
| `rate_limiter_blocked_total`       | Counter   | `strategy` | Requests denied (HTTP 429)          |
| `rate_limiter_check_duration_ms`   | Histogram | `strategy` | Latency of each check (ms buckets)  |
| `rate_limiter_redis_available`     | Gauge     | —          | 1 if Redis is reachable, 0 if not  |

Structured request logging is handled by **pino-http**. Each request logs:
- method, path, status code, response time
- rate limit decisions (warn on 429, error on 5xx)

---

## Resilience & Failure Scenarios

### Redis Unavailable

When Redis becomes unreachable, `isRedisAvailable()` returns `false`. The service **fails open** by default: requests pass through without rate limiting. This is controlled by `RATE_LIMITER_FALLBACK=true`.

**Tradeoff:** Fail-open protects availability but allows abuse during outages. For high-security APIs, set `RATE_LIMITER_FALLBACK=false` to return HTTP 503 instead.

### Redis Command Timeout

`commandTimeout` is set to 1000ms. If a Redis command exceeds this, ioredis rejects the promise. The catch block in `RateLimiterService` treats this as a Redis failure and applies the fallback policy.

### Script Cache Eviction

Redis clears the Lua script cache on restart. The `NOSCRIPT` error handler automatically calls `SCRIPT LOAD` again and retries the operation — transparent to the caller.

### Key Expiry

All Redis keys have TTLs set to the window duration (or 2× for token buckets). This prevents unbounded key accumulation and handles the case where a client stops sending requests — its slot is automatically freed.

---

## Scaling Strategy

### Horizontal Scaling (multiple app instances)

Because all state lives in Redis (not in process memory), adding more app replicas requires no coordination. Each instance:
1. Reads the same Redis keys
2. Executes the same Lua scripts
3. Sees the same rate limit decisions

Deploy with a load balancer in front (NGINX, AWS ALB, etc.). No sticky sessions required.

### Redis Scaling

For very high throughput:

- **Redis Cluster:** Shard keys across multiple Redis nodes. Note that Lua scripts must only access keys on the same slot — ensure your key prefix routes related keys to the same node using Redis hash tags `{prefix}`.
- **Redis Sentinel:** Primary/replica failover with automatic promotion. The ioredis client supports Sentinel natively.
- **Read replicas:** Not applicable here — all operations are read-modify-write and must go to the primary.

### Memory Estimation

| Algorithm      | Memory per key                   |
|---------------|----------------------------------|
| Fixed Window  | ~60 bytes (string + TTL)         |
| Sliding Window| ~100 bytes × requests in window  |
| Token Bucket  | ~150 bytes (hash with 2 fields)  |

For 1M active sliding-window keys at 30 req/min: ~3GB. Plan capacity accordingly, or use fixed-window for memory-constrained scenarios.

---

## When to Use Each Algorithm

```
Need simple quotas, can tolerate boundary bursts?
  → Fixed Window

Need precise fairness, no boundary abuse possible?
  → Sliding Window

Need to allow legitimate bursts while enforcing sustained rate?
  → Token Bucket

Need minimum memory usage at extreme scale?
  → Fixed Window or Token Bucket (not Sliding Window)

Protecting a compute-heavy endpoint from sustained abuse?
  → Token Bucket (burst capacity absorbs reconnect storms)
```

---

## Getting Started

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ (for local dev)

### With Docker (recommended)

```bash
docker compose up --build
```

Service is available at `http://localhost:3000`.

### Local Development

```bash
cp .env.example .env
npm install
# Start Redis separately:
docker run -d -p 6379:6379 redis:7-alpine
npm run dev
```

### Environment Variables

| Variable                  | Default       | Description                              |
|--------------------------|---------------|------------------------------------------|
| `PORT`                   | `3000`        | HTTP server port                         |
| `NODE_ENV`               | `development` | `development`, `test`, or `production`   |
| `REDIS_MODE`             | `standalone`  | `standalone`, `sentinel`, or `cluster`   |
| `REDIS_HOST`             | `localhost`   | Redis hostname (standalone mode)         |
| `REDIS_PORT`             | `6379`        | Redis port (standalone mode)             |
| `REDIS_PASSWORD`         | —             | Redis AUTH password (if set)             |
| `REDIS_DB`               | `0`           | Redis database index                     |
| `REDIS_CONNECT_TIMEOUT`  | `5000`        | Connection timeout (ms)                  |
| `REDIS_COMMAND_TIMEOUT`  | `1000`        | Per-command timeout (ms)                 |
| `REDIS_SENTINEL_NAME`    | `mymaster`    | Sentinel master name                     |
| `REDIS_SENTINEL_HOSTS`   | —             | CSV `host:port` list of Sentinel nodes   |
| `REDIS_CLUSTER_NODES`    | —             | CSV `host:port` list of Cluster seed nodes |
| `RATE_LIMITER_FALLBACK`  | `true`        | Fail-open on Redis failure               |
| `RATE_LIMITER_KEY_PREFIX`| `rl`          | Redis key prefix                         |
| `JWT_SECRET`             | —             | HS256 shared secret (enables JWT auth)   |
| `JWT_ALGORITHM`          | `HS256`       | JWT signing algorithm                    |
| `JWT_JWKS_URI`           | —             | JWKS endpoint for asymmetric verification |

### Authentication

The `/protected` and `/heavy` endpoints scope rate limits per user (and per tenant for `/heavy`). Identity is resolved by [src/middleware/auth.ts](src/middleware/auth.ts) in two modes:

- **Dev/test mode** — when neither `JWT_SECRET` nor `JWT_JWKS_URI` is set, the middleware trusts `x-user-id` and `x-tenant-id` request headers. Convenient for local testing and CI; **never enable this in production**.
- **JWT mode** — when `JWT_SECRET` (HS256) or `JWT_JWKS_URI` (asymmetric, e.g. RS256 from an IdP) is configured, requests must present `Authorization: Bearer <token>`. `userId` is read from `sub` (or `userId` / `user_id`); `tenantId` from `tenantId` / `tenant_id`. Requests without a token are still allowed through but treated as anonymous and rate-limited by IP only.

---

## Running Tests

```bash
# All tests
npm test

# Unit tests only (strategies, no Redis required)
npm run test:unit

# Integration tests only (mocked Redis)
npm run test:integration

# With coverage report
npm run test:coverage
```

Unit tests mock the Redis client entirely — they verify algorithm logic, NOSCRIPT retry behavior, and header correctness without any infrastructure dependency.

Integration tests mock the `src/redis/client` wrapper and exercise the full HTTP stack including middleware, routing, headers, and 429 responses.

### Redis Cluster integration tests

[tests/integration/cluster.test.ts](tests/integration/cluster.test.ts) exercises EVALSHA, key slot distribution, and NOSCRIPT recovery against a real 3-node cluster. The suite is **skipped by default** so `npm test` does not require infrastructure. To run it:

```bash
docker compose --profile cluster up -d
REDIS_CLUSTER_TEST=1 npx jest tests/integration/cluster.test.ts
```

`REDIS_CLUSTER_NODES` (default `127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003`) overrides the seed list.

---

## Benchmarking

Start the service first (`docker compose up` or `npm run dev`), then:

```bash
npm run benchmark

# Override defaults:
BENCHMARK_REQUESTS=2000 BENCHMARK_CONCURRENCY=100 npm run benchmark
```

**What the benchmark does:**
- Sends `BENCHMARK_REQUESTS` requests to each of `/public`, `/protected`, `/heavy`
- Rotates across 10 user IDs and 3 tenant IDs to simulate realistic multi-tenant traffic
- Reports: allowed/blocked counts, block rate %, avg/p50/p95/p99 latency, req/sec

**Expected behavior under load:**

- `/public` (100 req/min per IP): most requests allowed in first batch, then 429s from concurrent users sharing the same "IP" in the benchmark. Block rate depends on concurrency vs. limit.
- `/protected` (30 req/min per user+IP): rotating user IDs spreads the load — each user gets their own counter. Low block rate with 10 users.
- `/heavy` (burst 20, 10/min sustained per user+tenant): initial burst absorbed, then throttled. Block rate rises steeply.

---

## Sample curl Requests

```bash
# Public endpoint — limited by IP
curl -i http://localhost:3000/public

# Protected endpoint — pass user identity via header
curl -i -H "x-user-id: alice" http://localhost:3000/protected

# Heavy endpoint — pass user and tenant
curl -i \
  -H "x-user-id: alice" \
  -H "x-tenant-id: acme-corp" \
  http://localhost:3000/heavy

# Same endpoint when JWT_SECRET is configured — identity comes from the token
# (sub → userId, tenantId/tenant_id claim → tenantId)
curl -i \
  -H "Authorization: Bearer $JWT" \
  http://localhost:3000/heavy

# Health check
curl http://localhost:3000/health

# Prometheus metrics
curl http://localhost:3000/metrics

# Simulate being rate limited (run 35 times quickly)
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "x-user-id: alice" \
    http://localhost:3000/protected
done
```

**Reading the 429 response:**

```bash
curl -i -H "x-user-id: alice" http://localhost:3000/protected
# When limited:
# HTTP/1.1 429 Too Many Requests
# X-RateLimit-Limit: 30
# X-RateLimit-Remaining: 0
# X-RateLimit-Strategy: sliding_window
# Retry-After: 42
# X-RateLimit-Reset: 1714320042000
#
# {"error":"Too Many Requests","strategy":"sliding_window","retryAfterMs":42000,"retryAfterSeconds":42}
```

---

## Advanced Features

Beyond the three core algorithms, the service ships with several capabilities for production use.

### Dynamic Configuration

Rate limiting rules can be loaded from external JSON files and reloaded without restarting the service. See [src/services/config/](src/services/config/) and the management endpoints exposed by [src/controllers/configController.ts](src/controllers/configController.ts).

### Analytics and Reporting

Usage is tracked by [src/services/analytics/](src/services/analytics/) and exposed via [src/controllers/analyticsController.ts](src/controllers/analyticsController.ts):

- Request volume tracking
- Allowed vs blocked requests
- Top paths and users
- Strategy effectiveness
- Time-based usage patterns

### Web-based Configuration Interface

A web UI at `/config-ui` allows administrators to manage rate limiting rules without code changes.

### Sophisticated Rate Limiting Policies

Advanced policies in [src/config/advancedRateLimitConfig.ts](src/config/advancedRateLimitConfig.ts):

- **Hierarchical Rate Limiting** — parent/child relationships for nested quotas
- **Time-Based Rate Limiting** — different limits at different times of day or week
- **Adaptive Rate Limiting** — limits that adjust based on observed usage patterns

### Configuration Validation

All configurations are validated for consistency and well-formedness before they are applied.
