/* eslint-disable no-console */
import axios, { AxiosResponse } from 'axios';

const BASE_URL = process.env.BENCHMARK_URL ?? 'http://localhost:3000';
const TOTAL_REQUESTS = parseInt(process.env.BENCHMARK_REQUESTS ?? '500', 10);
const CONCURRENCY = parseInt(process.env.BENCHMARK_CONCURRENCY ?? '50', 10);

interface EndpointBenchmark {
  endpoint: string;
  total: number;
  allowed: number;
  blocked: number;
  errors: number;
  durationMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsPerSecond: number;
  blockRatePct: string;
}

interface RequestResult {
  status: number;
  latencyMs: number;
}

async function sendRequest(
  endpoint: string,
  userId: string,
  tenantId: string,
): Promise<RequestResult> {
  const start = Date.now();
  try {
    const res: AxiosResponse = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: { 'x-user-id': userId, 'x-tenant-id': tenantId },
      validateStatus: () => true,
      timeout: 5_000,
    });
    return { status: res.status, latencyMs: Date.now() - start };
  } catch {
    return { status: 0, latencyMs: Date.now() - start };
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

async function runBenchmark(endpoint: string): Promise<EndpointBenchmark> {
  const latencies: number[] = [];
  let allowed = 0;
  let blocked = 0;
  let errors = 0;
  const wallStart = Date.now();
  const numBatches = Math.ceil(TOTAL_REQUESTS / CONCURRENCY);

  for (let batch = 0; batch < numBatches; batch++) {
    const batchSize = Math.min(CONCURRENCY, TOTAL_REQUESTS - batch * CONCURRENCY);
    const promises = Array.from({ length: batchSize }, (_, i) => {
      const idx = batch * CONCURRENCY + i;
      return sendRequest(endpoint, `user-${idx % 10}`, `tenant-${idx % 3}`);
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      latencies.push(r.latencyMs);
      if (r.status === 200) allowed++;
      else if (r.status === 429) blocked++;
      else errors++;
    }
  }

  const durationMs = Date.now() - wallStart;
  latencies.sort((a, b) => a - b);

  return {
    endpoint,
    total: TOTAL_REQUESTS,
    allowed,
    blocked,
    errors,
    durationMs,
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    p99LatencyMs: percentile(latencies, 0.99),
    requestsPerSecond: Math.round((TOTAL_REQUESTS / durationMs) * 1000),
    blockRatePct: `${((blocked / TOTAL_REQUESTS) * 100).toFixed(1)}%`,
  };
}

function printResult(r: EndpointBenchmark): void {
  console.log(`\n─── ${r.endpoint} ────────────────────────────────────`);
  console.log(`  Total       : ${r.total}`);
  console.log(`  Allowed 200 : ${r.allowed}`);
  console.log(`  Blocked 429 : ${r.blocked}  (${r.blockRatePct})`);
  console.log(`  Errors      : ${r.errors}`);
  console.log(`  Duration    : ${r.durationMs}ms`);
  console.log(`  Req/sec     : ${r.requestsPerSecond}`);
  console.log(`  Avg latency : ${r.avgLatencyMs}ms`);
  console.log(`  P50 latency : ${r.p50LatencyMs}ms`);
  console.log(`  P95 latency : ${r.p95LatencyMs}ms`);
  console.log(`  P99 latency : ${r.p99LatencyMs}ms`);
}

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║      Distributed Rate Limiter — Benchmark        ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Target      : ${BASE_URL}`);
  console.log(`  Requests    : ${TOTAL_REQUESTS}`);
  console.log(`  Concurrency : ${CONCURRENCY}`);

  const endpoints = ['/public', '/protected', '/heavy', '/api'];

  for (const endpoint of endpoints) {
    process.stdout.write(`\nRunning ${endpoint}...`);
    const result = await runBenchmark(endpoint);
    process.stdout.write(' done');
    printResult(result);
  }

  console.log('\n══════════════════════════════════════════════════\n');
}

main().catch((err: Error) => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
