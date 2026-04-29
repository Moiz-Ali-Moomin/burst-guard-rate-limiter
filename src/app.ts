import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { rateLimiterMiddleware } from './middleware/rateLimiter';
import { jwtAuthMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import exampleRouter from './controllers/exampleController';
import metricsRouter from './controllers/metricsController';
import healthRouter from './controllers/healthController';
import analyticsRouter from './controllers/analyticsController';
import configRouter from './controllers/configController';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res) => {
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode === 429) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(jwtAuthMiddleware);

  app.use(healthRouter);
  app.use(metricsRouter);
  app.use(analyticsRouter);
  app.use(configRouter);
  app.use(rateLimiterMiddleware);
  app.use(exampleRouter);

  app.use(errorHandler);

  return app;
}
