import { trace } from "@opentelemetry/api";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import { OpenTelemetryWorkflowClientInterceptor } from "@temporalio/interceptors-opentelemetry";
import { DefaultLogger } from "@temporalio/worker";

import { getRequiredEnv } from "./environment.js";
import type { Logger } from "./logger.js";

export { Client as TemporalClient } from "@temporalio/client";

export const temporalNamespace = "HASH";

/**
 * Adapter that pipes Temporal SDK logs (both Rust core and Node-side
 * worker events) through the application logger, keeping them in the
 * same JSON format and log-level scheme as the rest of the worker
 * output. Pass to `Runtime.install({ logger })`.
 */
export const createTemporalSdkLogger = (logger: Logger): DefaultLogger =>
  // DefaultLogger filters at INFO, so TRACE / DEBUG paths only fire
  // when the level is bumped at the call site.
  new DefaultLogger("INFO", ({ level, message, meta }) => {
    switch (level) {
      case "TRACE":
      case "DEBUG":
        logger.debug(message, meta);
        return;
      case "INFO":
        logger.info(message, meta);
        return;
      case "WARN":
        logger.warn(message, meta);
        return;
      case "ERROR":
        logger.error(message, meta);
        return;
      default:
        logger.warn(`Unknown Temporal SDK log level: ${level as string}`, {
          message,
          meta,
        });
    }
  });

export const createTemporalClient = async () => {
  const temporalServerHost = getRequiredEnv("HASH_TEMPORAL_SERVER_HOST");

  const host = new URL(temporalServerHost).hostname;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
  const port = parseInt(process.env.HASH_TEMPORAL_SERVER_PORT || "7233", 10);

  const connection = await Connection.connect({
    address: `${host}:${port}`,
  });

  // When OTEL is configured the active trace context (e.g. an Express
  // HTTP span) is injected into workflow start headers. The worker-side
  // interceptors extract it and parent the workflow + activity spans
  // off the caller's trace.
  const interceptors = process.env.HASH_OTLP_ENDPOINT
    ? {
        workflow: [
          new OpenTelemetryWorkflowClientInterceptor({
            tracer: trace.getTracer("@temporalio/interceptors-opentelemetry"),
          }),
        ],
      }
    : undefined;

  return new TemporalClient({
    connection,
    namespace: temporalNamespace,
    interceptors,
  });
};
