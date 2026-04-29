import { trace } from "@opentelemetry/api";
import { Client as TemporalClient, Connection } from "@temporalio/client";
import { OpenTelemetryWorkflowClientInterceptor } from "@temporalio/interceptors-opentelemetry";
import { DefaultLogger } from "@temporalio/worker";

import { getRequiredEnv } from "./environment.js";
import type { Logger } from "./logger.js";

export { Client as TemporalClient } from "@temporalio/client";

export const temporalNamespace = "HASH";

/**
 * Create a Temporal SDK `Logger` that pipes Rust-core SDK logs and
 * Node-side worker events through the application's structured Winston
 * logger. Without this, `Runtime.install({ telemetryOptions: { logging:
 * { forward } } })` forwards Rust-core logs to a default sink that
 * writes to `stderr` directly — bypassing OTLP and the JSON-formatted
 * console output the rest of the worker uses.
 */
export const createTemporalSdkLogger = (logger: Logger): DefaultLogger =>
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

  // When the caller has OTEL configured (instrument.mjs ran and a global
  // tracer provider is registered), attach the workflow client
  // interceptor so the active trace context (e.g. an Express HTTP span)
  // gets propagated into the workflow headers. The worker-side
  // interceptors then pick it up, and the workflow + activity spans
  // chain off the caller's trace.
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
