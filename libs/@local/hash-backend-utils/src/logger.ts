/**
 * Structured logging library based on winston.
 */
import * as winston from "winston";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LoggerConfig = {
  mode: "dev" | "prod";
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

export class Logger {
  silly: (...msg: any) => void;
  debug: (...msg: any) => void;
  info: (...msg: any) => void;
  warn: (...msg: any) => void;
  error: (...msg: any) => void;

  constructor(private cfg: LoggerConfig) {
    this.cfg = cfg;

    const logger = winston.createLogger({
      level: cfg.level ?? getDefaultLoggerLevel(),
      format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: { service: cfg.serviceName, ...(cfg.metadata ?? {}) },
    });
    if (cfg.mode === "dev") {
      logger.add(
        new winston.transports.Console({
          level: cfg.level,
          format: winston.format.combine(
            winston.format.json(),
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      );
    } else {
      // TODO: add production logging transport here
      // Datadog: https://github.com/winstonjs/winston/blob/master/docs/transports.md#datadog-transport
      // Just output to console for now
      logger.add(
        new winston.transports.Console({
          level: cfg.level,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
            winston.format.simple(),
          ),
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
