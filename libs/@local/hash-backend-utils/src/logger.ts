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

/**
 * Recursively replace values in a log payload that JSON.stringify cannot
 * usefully serialise on its own:
 *
 * - Errors: their `message`, `stack`, `name`, and `cause` are non-enumerable
 *   so a plain `JSON.stringify(new Error("x"))` produces `{}`.
 * - BigInts: throw `TypeError: Do not know how to serialize a BigInt`.
 *
 * Returns a value safe to pass to `JSON.stringify` (or a stringifier like
 * winston's `format.json()`) without losing information.
 */
export const expandLogValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause !== undefined
        ? { cause: expandLogValue(value.cause) }
        : {}),
    };
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(expandLogValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = expandLogValue(nested);
    }
    return out;
  }
  return value;
};

/**
 * `JSON.stringify` that survives Errors, BigInts, and circular references.
 * Falls back to a marker string rather than throwing.
 */
export const safeStringify = (
  value: unknown,
  options?: {
    space?: number;
    replacer?: (key: string, value: unknown) => unknown;
  },
): string => {
  try {
    return JSON.stringify(
      expandLogValue(value),
      options?.replacer,
      options?.space,
    );
  } catch (error) {
    return `[unserialisable: ${(error as Error).message}]`;
  }
};

/**
 * Winston format that recursively expands non-enumerable Error properties
 * and BigInts in the info object before any later format (notably
 * `format.json`) tries to serialise it.
 */
const expandLogValuesFormat = format(
  (info) => expandLogValue(info) as winston.Logform.TransformableInfo,
);

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
  return safeStringify(value);
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

      message = safeStringify(restMessage, {
        replacer: (key, value) =>
          detailedFields?.includes(key) ? undefined : value,
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
        // Run before any later format that stringifies the info object
        // (format.json on each transport) so Errors and BigInts in nested
        // meta don't serialise to `{}` or throw.
        expandLogValuesFormat(),
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
