import pino from 'pino';
import type { LoggerService } from '@nestjs/common';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'cookie',
      'authorization',
      'body',
      'payload',
      '*.password',
      '*.token',
      '*.secret',
    ],
    remove: true,
  },
});
export class NestLogger implements LoggerService {
  log() {
    /* Lifecycle noise is omitted; application events use the safe structured sink. */
  }
  debug() {}
  verbose() {}
  warn() {
    logger.warn('Application warning');
  }
  error() {
    logger.error('Application operation failed');
  }
  fatal() {
    logger.fatal('Application failure');
  }
}
