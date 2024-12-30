import pino from 'pino';
import pinoPretty from 'pino-pretty';

/**
 * Create a pino logger instance with pino-pretty for better console logs.
 * We use 'info' for normal flow logs, 'debug' for detailed logs, 'error' for error logs.
 */
export const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname"
    }
  }
});