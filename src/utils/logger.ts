import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.server.env === 'production' ? 'info' : 'debug',
  ...(config.server.env !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  }),
});
