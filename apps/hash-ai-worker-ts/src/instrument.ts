/**
 * OpenTelemetry bootstrap for the AI worker. Imported as the very first
 * statement of `main.ts` so the auto-instrumentations can patch http
 * and gRPC modules before any other code requires them.
 */
import {
  createHttpInstrumentation,
  createUndiciInstrumentation,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc";

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
        createHttpInstrumentation(otlpEndpoint),
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
    // Outside production, fail loud: realistic causes here are coding
    // errors (bad URL, malformed instrumentation config) and hiding
    // them in dev/CI loses regressions.
    if (process.env.NODE_ENV !== "production") {
      throw error;
    }
    // eslint-disable-next-line no-console
    console.error(
      "OpenTelemetry bootstrap failed; AI worker will start without telemetry.",
      error,
    );
    return undefined;
  }
})();
