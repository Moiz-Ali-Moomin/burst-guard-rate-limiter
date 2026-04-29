import { createApp } from './app';
import { config } from './config';
import { connectRedis, disconnectRedis } from './redis/client';
import { logger } from './utils/logger';
import { getDynamicConfigService } from './services/config/dynamicConfigService';

async function start(): Promise<void> {
  await connectRedis();

  // Initialize dynamic configuration service with file watching enabled
  getDynamicConfigService({
    configPath: './config/rate-limit-rules.json',
    watchConfig: true,
  });

  const app = createApp();

  const server = app.listen(config.server.port, () => {
    logger.info(
      { port: config.server.port, env: config.server.env },
      'Distributed rate limiter started',
    );
  });

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      await disconnectRedis();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
