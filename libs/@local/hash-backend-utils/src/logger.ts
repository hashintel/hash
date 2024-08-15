/**
 * Structured logging library based on winston.
 */
import { format } from "logform";
import type { LeveledLogMethod } from "winston";
import * as winston from "winston";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LoggerConfig = {
  environment: "development" | "production" | "test";
  level?: LogLevel;
  serviceName: string;
  metadata?: Record<string, string>;
};

const tbdIsLogLevel = (level: string): level is LogLevel =>
  LOG_LEVELS.includes(level as LogLevel);

const getDefaultLoggerLevel = () => {
  const envLogLevel = process.env.LOG_LEVEL;
  return envLogLevel && tbdIsLogLevel(envLogLevel) ? envLogLevel : "info";
};

/**
 * In some places we want to prefix a console log with a specific string,
 * without having this pollute the structured log when it's recorded elsewhere.
 * This function takes the consolePrefix (if it exists) and prepends the message with it for the console transport.
 * A corresponding format is used to remove the consolePrefix from the message in the Http transport.
 *
 * This also removes any 'detailedFields' from the message if any are specified.
 */
const rewriteForConsole = format(
  (original: winston.Logform.TransformableInfo & { message: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { message: fullMessage, ...metadata } = original;

    const { consolePrefix, ...restMetadata } = metadata;

    if (!consolePrefix) {
      return original;
    }

    let message: string;
    if (typeof fullMessage === "object" && fullMessage !== null) {
      const { detailedFields, ...restMessage } = fullMessage as {
        detailedFields?: string[];
        [key: string]: unknown;
      };

      message = JSON.stringify(restMessage, (key, value) => {
        /**
         * Don't include any 'detailedFields' in the console if provided
         * - if provided, they will appear in other destinations (e.g. DataDog).
         */
        if (detailedFields?.includes(key)) {
          return undefined;
        }

        return value as unknown;
      });
    } else {
      message = fullMessage as string;
    }

    return {
      message: `${consolePrefix} ${message}`,
      ...restMetadata,
    };
  },
);

export class Logger {
  silly: LeveledLogMethod;
  debug: LeveledLogMethod;
  info: LeveledLogMethod;
  warn: LeveledLogMethod;
  error: LeveledLogMethod;

  constructor(private cfg: LoggerConfig) {
    this.cfg = cfg;

    this.cfg.metadata = {
      ...(this.cfg.metadata ?? {}),
      environment: cfg.environment,
    };

    const level = cfg.level ?? getDefaultLoggerLevel();

    const logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: { service: cfg.serviceName, ...this.cfg.metadata },
    });
    if (cfg.environment === "development") {
      logger.add(
        new winston.transports.Console({
          level: cfg.level,
          format: winston.format.combine(
            winston.format.timestamp(),
            rewriteForConsole(),
            winston.format.json(),
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      );
    } else {
      logger.add(
        new winston.transports.Console({
          level,
          format: winston.format.combine(
            winston.format.timestamp(),
            rewriteForConsole(),
            winston.format.json(),
            winston.format.simple(),
          ),
        }),
      );
    }

    if (process.env.DATADOG_API_KEY) {
      logger.add(
        new winston.transports.Http({
          format: winston.format.combine(
            winston.format.json(),
            /**
             * Ignore the `consolePrefix` field in the logs, if one is provided
             */
            format(({ consolePrefix: _, ...rest }) => rest)(),
          ),
          host: "http-intake.logs.datadoghq.com",
          level,
          path: `/api/v2/logs?dd-api-key=${process.env.DATADOG_API_KEY}&ddsource=nodejs&service=${cfg.serviceName}`,
        }),
      );
    }

    this.silly = logger.silly.bind(logger);
    this.debug = logger.debug.bind(logger);
    this.info = logger.info.bind(logger);
    this.warn = logger.warn.bind(logger);
    this.error = logger.error.bind(logger);
  }

  /** Create a child logger with extra `metadata`. */
  child(metadata: Record<string, string>): Logger {
    return new Logger({
      ...this.cfg,
      metadata: { ...(this.cfg.metadata ?? {}), ...metadata },
    });
  }
}
