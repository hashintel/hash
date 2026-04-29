/**
 * OpenTelemetry bootstrap for the AI worker. Imported as the very first
 * statement of `main.ts` so the auto-instrumentations can patch http
 * and gRPC modules before any other code requires them.
 */
import {
  createUndiciInstrumentation,
  httpRequestSpanNameHook,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";

/**
 * Setup handles. `undefined` when no `HASH_OTLP_ENDPOINT` is configured
 * (no collector) or when bootstrap throws.
 */
export const otelSetup: ReturnType<typeof registerOpenTelemetry> = (() => {
  const otlpEndpoint = process.env.HASH_OTLP_ENDPOINT;
  if (!otlpEndpoint) {
    return undefined;
  }
  try {
    return registerOpenTelemetry({
      endpoint: otlpEndpoint,
      serviceName: process.env.OTEL_SERVICE_NAME ?? "AI Worker",
      instrumentations: [
        new HttpInstrumentation({
          // Don't trace the OTLP exporter's own outgoing requests — every
          // export would create a span that needs to be exported, recursively.
          ignoreOutgoingRequestHook: (options) => options.port === 4317,
          requestHook: httpRequestSpanNameHook,
        }),
        new GrpcInstrumentation(),
        // Native `fetch` (used by openai / @anthropic-ai/sdk / Vertex AI
        // SDKs) goes through undici, which the http instrumentation does
        // not patch. The shared helper sets `peer.service` so Tempo's
        // service_graphs processor renders external dependencies as
        // edges in the service map.
        createUndiciInstrumentation(),
      ],
    });
  } catch (error) {
    // Bootstrap runs before any logger is wired up, so direct stderr is
    // the right channel. Don't rethrow — the worker should still start
    // without telemetry.
    // eslint-disable-next-line no-console
    console.error(
      "OpenTelemetry bootstrap failed; AI worker will start without telemetry.",
      error,
    );
    return undefined;
  }
})();
