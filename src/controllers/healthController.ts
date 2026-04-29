import { Router, Request, Response } from 'express';
import { isRedisAvailable } from '../redis/client';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const redisOk = isRedisAvailable();
  const status = redisOk ? 'ok' : 'degraded';

  res.status(redisOk ? 200 : 503).json({
    status,
    redis: redisOk ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
