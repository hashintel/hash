/**
 * Structured logging library based on winston.
 */
import { trace } from "@opentelemetry/api";
import type { AnyValue, AnyValueMap } from "@opentelemetry/api-logs";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { format } from "logform";
import type { LeveledLogMethod } from "winston";
import * as winston from "winston";
import Transport from "winston-transport";

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

function mapWinstonLevelToOtel(level: string): SeverityNumber {
  switch (level) {
    case "error":
      return SeverityNumber.ERROR;
    case "warn":
      return SeverityNumber.WARN;
    case "info":
      return SeverityNumber.INFO;
    case "debug":
      return SeverityNumber.DEBUG;
    default:
      return SeverityNumber.TRACE;
  }
}

function toAnyValue(value: unknown): AnyValue {
  if (value === null || value === undefined) {
    return undefined;
  }
  const typeofValue = typeof value;
  if (
    typeofValue === "string" ||
    typeofValue === "number" ||
    typeofValue === "boolean"
  ) {
    return value as AnyValue;
  }
  try {
    return JSON.stringify(value);
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value);
  }
}

function sanitizeAttributes(obj: Record<string, unknown>): AnyValueMap {
  const out: AnyValueMap = {};
  for (const [key, value] of Object.entries(obj)) {
    const anyValue = toAnyValue(value);
    if (anyValue !== undefined) {
      out[key] = anyValue;
    }
  }
  return out;
}

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
    const { message: fullMessage, ...metadata } = original;

    const { consolePrefix, ...restMetadata } = metadata;

    if (typeof consolePrefix !== "string" || consolePrefix.length === 0) {
      return original;
    }

    let message: string;
    if (typeof fullMessage === "object" && fullMessage !== null) {
      const { detailedFields, ...restMessage } = fullMessage as {
        detailedFields?: string[];
        [key: string]: unknown;
      };

      message = JSON.stringify(restMessage, (key, value) => {
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

class OpenTelemetryLogTransport extends Transport {
  override log(
    info: winston.Logform.TransformableInfo & { message: unknown },
    callback: () => void,
  ): void {
    setImmediate(() => this.emit("logged", info));

    try {
      const globalProvider = logs.getLoggerProvider();
      const otelLogger = globalProvider.getLogger("winston", "1.0.0");

      const { level, message, ...rest } = info;

      const attributes: AnyValueMap = sanitizeAttributes(rest);

      const spanContext = trace.getActiveSpan()?.spanContext();
      if (spanContext) {
        attributes.trace_id = spanContext.traceId as AnyValue;
        attributes.span_id = spanContext.spanId as AnyValue;
      }

      otelLogger.emit({
        body: toAnyValue(message),
        severityText: level.toUpperCase(),
        severityNumber: mapWinstonLevelToOtel(level),
        attributes,
      });
    } catch {
      // best-effort: do not throw from logger
    }

    callback();
  }
}

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

    // Add OpenTelemetry transport if OTel is initialized (env-driven)
    if (process.env.HASH_OTLP_ENDPOINT) {
      logger.add(new OpenTelemetryLogTransport({ level }));
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
