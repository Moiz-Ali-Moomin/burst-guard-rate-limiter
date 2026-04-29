import { Router, Request, Response } from 'express';
import { AuthenticatedRequest } from '../utils/keyBuilder';

const router = Router();

router.get('/public', (_req: Request, res: Response) => {
  res.json({
    message: 'Public endpoint',
    rateLimit: 'Fixed Window — 100 req/min per IP',
  });
});

router.get('/protected', (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  res.json({
    message: 'Protected endpoint',
    rateLimit: 'Sliding Window — 30 req/min per user+IP',
    userId: authed.userId ?? 'anonymous',
  });
});

router.get('/heavy', (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  res.json({
    message: 'Heavy endpoint',
    rateLimit: 'Token Bucket — 10/min sustained, burst 20, per user+tenant',
    userId: authed.userId ?? 'anonymous',
    tenantId: authed.tenantId ?? 'default',
  });
});

router.get('/api', (_req: Request, res: Response) => {
  res.json({
    message: 'API endpoint',
    rateLimit: 'Sliding Window Counter — 200 req/min per IP',
  });
});

export default router;
