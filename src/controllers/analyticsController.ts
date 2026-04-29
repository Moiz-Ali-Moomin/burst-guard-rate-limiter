import { Router, Request, Response } from 'express';
import { RateLimitAnalyticsService } from '../services/analytics/rateLimitAnalyticsService';

const router = Router();
const analyticsService = RateLimitAnalyticsService.getInstance();

router.get('/analytics/summary', async (_req: Request, res: Response) => {
  try {
    const summary = await analyticsService.getAnalyticsSummary();
    res.json(summary);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to get analytics summary' });
  }
});

router.get('/analytics/recommendations', async (_req: Request, res: Response) => {
  try {
    const recommendations = await analyticsService.getUsageRecommendations();
    res.json(recommendations);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

export default router;
