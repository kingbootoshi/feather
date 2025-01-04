import pino from 'pino';
import pinoPretty from 'pino-pretty';

/**
 * Create a pino logger instance with pino-pretty for better console logs.
 * We use 'info' for normal flow logs, 'debug' for detailed logs, and 'error' for errors.
 * Transport options specify colorization and log formatting.
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