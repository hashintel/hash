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
 * - Errors: do not implement `toJSON`, and `message` / `stack` / `cause`
 *   are non-enumerable own or inherited properties, so
 *   `JSON.stringify(new Error("x"))` returns `{}`. This rebuild is the
 *   canonical handling for log payloads — call sites should pass
 *   `logger.X("desc", { error })` and rely on this expansion rather
 *   than pre-stringify the error themselves.
 * - BigInts: throw `TypeError: Do not know how to serialize a BigInt`.
 *
 * Values that already implement `toJSON` (Date, Buffer, decimal/ID types,
 * etc.) are passed through unchanged — `JSON.stringify` will call `toJSON`
 * on them and produce the right representation. Rebuilding their fields
 * via `Object.entries` would lose the `toJSON` hook (e.g. `Date` would
 * become `{}`).
 *
 * Cycles are tracked via a path-scoped `Set` (added before recursion,
 * removed after) so true self-references collapse to `[Circular]`
 * without falsely flagging legitimate shared references that appear in
 * sibling positions. Errors are part of this protection — Axios
 * v1.12+ is known to produce `Error.cause` chains that loop back on
 * themselves, which would otherwise blow the stack.
 */
export const expandLogValue = (
  value: unknown,
  ancestors: Set<object> = new Set(),
): unknown => {
  if (value instanceof Error) {
    if (ancestors.has(value)) {
      return "[Circular]";
    }
    ancestors.add(value);
    try {
      const out: Record<string, unknown> = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      // Preserve enumerable own properties added by Error subclasses
      // (e.g. `status`, `code`, `headers` on OpenAI.APIError or
      // AxiosError) — `Object.entries` skips name/message/stack
      // because those are non-enumerable on the prototype, so we
      // don't double up on them.
      for (const [key, nested] of Object.entries(value)) {
        if (key !== "cause") {
          out[key] = expandLogValue(nested, ancestors);
        }
      }
      if (value.cause !== undefined) {
        out.cause = expandLogValue(value.cause, ancestors);
      }
      return out;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (ancestors.has(value)) {
    return "[Circular]";
  }

  // Anything with its own `toJSON` knows how to serialise itself —
  // pass through and let `JSON.stringify` invoke it.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return value;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => expandLogValue(item, ancestors));
    }
    const out: Record<string | symbol, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = expandLogValue(nested, ancestors);
    }
    // Carry symbol-keyed properties through unchanged. Winston attaches
    // its finalised level/message/splat under `Symbol.for("level")` etc.,
    // and `Object.entries` only enumerates string keys, so without this
    // step a recursive rebuild silently strips them.
    for (const sym of Object.getOwnPropertySymbols(value)) {
      out[sym] = (value as Record<string | symbol, unknown>)[sym];
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
};

/**
 * `JSON.stringify` that handles values which would otherwise lose
 * information or throw: Errors, BigInts, types with `toJSON`. Plain-object
 * cycles are rewritten to `[Circular]` by `expandLogValue`; anything that
 * still throws inside `JSON.stringify` is caught and replaced with a
 * marker string rather than propagated.
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
    return `[unserializable: ${(error as Error).message}]`;
  }
};

/**
 * Winston format that expands Errors / BigInts / cycles in the info
 * object before any later format (notably `format.json`) tries to
 * serialise it. Wrapped in try/catch so a malformed payload cannot
 * throw out of the Winston pipeline.
 */
const expandLogValuesFormat = format((info) => {
  try {
    return expandLogValue(info) as winston.Logform.TransformableInfo;
  } catch {
    return info;
  }
});

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
 * Also removes any `detailedFields` listed in the payload — both from a
 * legacy object-shaped `message` and from the top-level info metadata
 * (callers that pass `logger.X("description", { detailedFields, ... })`
 * spread the field list into the info object directly).
 */
const rewriteForConsole = format(
  (original: winston.Logform.TransformableInfo & { message: unknown }) => {
    const consolePrefix = (original as { consolePrefix?: unknown })
      .consolePrefix;

    if (typeof consolePrefix !== "string" || consolePrefix.length === 0) {
      return original;
    }

    const fullMessage = original.message;
    const detailedFromMeta = (original as { detailedFields?: unknown })
      .detailedFields;
    let detailedKeys: string[] | undefined = Array.isArray(detailedFromMeta)
      ? (detailedFromMeta as string[])
      : undefined;

    let message: string;
    if (typeof fullMessage === "object" && fullMessage !== null) {
      const { detailedFields: detailedFromMessage, ...restMessage } =
        fullMessage as {
          detailedFields?: string[];
          [key: string]: unknown;
        };

      detailedKeys = detailedKeys ?? detailedFromMessage;

      message = safeStringify(restMessage, {
        replacer: (key, value) =>
          detailedKeys?.includes(key) ? undefined : value,
      });
    } else {
      message = fullMessage as string;
    }

    // Strip detailed fields and `consolePrefix`/`detailedFields` markers
    // from the surrounding metadata before they reach the console
    // formatter, so heavy payloads (request/response blobs) don't get
    // dumped into stdout.
    const cleanedInfo: winston.Logform.TransformableInfo = {
      ...original,
      message: `${consolePrefix} ${message}`,
    };
    delete (cleanedInfo as { consolePrefix?: unknown }).consolePrefix;
    delete (cleanedInfo as { detailedFields?: unknown }).detailedFields;
    if (detailedKeys) {
      for (const key of detailedKeys) {
        delete (cleanedInfo as Record<string, unknown>)[key];
      }
    }
    return cleanedInfo;
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
