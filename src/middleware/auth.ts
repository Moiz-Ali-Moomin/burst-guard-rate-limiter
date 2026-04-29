import { Request, Response, NextFunction } from 'express';
import https from 'node:https';
import http from 'node:http';
import * as crypto from 'node:crypto';
import { createPublicKey, KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticatedRequest } from '../utils/keyBuilder';
import { logger } from '../utils/logger';

// ── JWKS key cache ────────────────────────────────────────────────────────────

interface JwkKey {
  kty: string;
  kid?: string;
  n?: string;
  e?: string;
  [k: string]: unknown;
}

let jwksCache: { keys: Map<string, KeyObject>; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 600_000; // 10 min

async function fetchJson(uri: string): Promise<{ keys: JwkKey[] }> {
  return new Promise((resolve, reject) => {
    const mod = uri.startsWith('https://') ? https : http;
    mod
      .get(uri, (res) => {
        let raw = '';
        res.on('data', (chunk: string) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as { keys: JwkKey[] });
          } catch {
            reject(new Error('JWKS response is not valid JSON'));
          }
        });
      })
      .on('error', reject);
  });
}

async function loadJwks(): Promise<Map<string, KeyObject>> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const { keys: jwks } = await fetchJson(config.jwt.jwksUri!);
  const map = new Map<string, KeyObject>();
  for (const jwk of jwks) {
    const keyObj = createPublicKey({ key: jwk as unknown as crypto.JsonWebKey, format: 'jwk' });
    map.set(jwk.kid ?? '', keyObj);
  }
  jwksCache = { keys: map, fetchedAt: now };
  return map;
}

async function getSigningKey(kid: string | undefined): Promise<KeyObject> {
  const map = await loadJwks();
  const key = map.get(kid ?? '') ?? map.values().next().value;
  if (!key) throw new Error(`No JWKS key found for kid=${kid ?? '(none)'}`);
  return key;
}

// ── JWT verification ──────────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<jwt.JwtPayload> {
  if (config.jwt.jwksUri) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') throw new Error('Invalid JWT format');
    const signingKey = await getSigningKey(decoded.header.kid);
    return jwt.verify(token, signingKey, { algorithms: [config.jwt.algorithm] }) as jwt.JwtPayload;
  }
  return jwt.verify(token, config.jwt.secret!, {
    algorithms: [config.jwt.algorithm],
  }) as jwt.JwtPayload;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function jwtAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authed = req as AuthenticatedRequest;

  if (!config.jwt.secret && !config.jwt.jwksUri) {
    // No auth configured — dev/test mode, trust custom headers
    authed.userId = (req.headers['x-user-id'] as string) || undefined;
    authed.tenantId = (req.headers['x-tenant-id'] as string) || undefined;
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token);

    authed.userId =
      (payload.sub as string | undefined) ??
      (payload['userId'] as string | undefined) ??
      (payload['user_id'] as string | undefined);

    authed.tenantId =
      (payload['tenantId'] as string | undefined) ?? (payload['tenant_id'] as string | undefined);
  } catch (err) {
    logger.warn({ err }, 'Invalid JWT — treating request as anonymous');
  }

  next();
}
