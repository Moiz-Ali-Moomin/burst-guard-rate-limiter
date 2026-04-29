import { Router, Request, Response } from 'express';
import { metricsService } from '../services/metricsService';

const router = Router();

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const registry = metricsService.getRegistry();
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (_err) {
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

export default router;
