/**
 * OpenTelemetry bootstrap for the AI worker. Imported as the very first
 * statement of `main.ts` so the auto-instrumentations can patch http
 * and gRPC modules before any other code requires them.
 */
import {
  createUndiciInstrumentation,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";

const otlpEndpoint = process.env.HASH_OTLP_ENDPOINT;

/**
 * Setup handles. `undefined` when no `HASH_OTLP_ENDPOINT` is configured —
 * `main.ts` checks for that and skips workflow-side OTEL wiring in that
 * case.
 */
export const otelSetup = otlpEndpoint
  ? registerOpenTelemetry({
      endpoint: otlpEndpoint,
      serviceName: process.env.OTEL_SERVICE_NAME ?? "AI Worker",
      instrumentations: [
        new HttpInstrumentation({
          // Don't trace the OTLP exporter's own outgoing requests, otherwise
          // every export creates a span that needs to be exported, recursively.
          ignoreOutgoingRequestHook: (options) => options.port === 4317,
          // Default span name is just `HTTP POST` — replace with
          // `METHOD /path` so outbound LLM / Graph calls are
          // distinguishable in Tempo.
          requestHook: (span, request) => {
            if (!("method" in request) || !request.method) {
              return;
            }
            const candidates = [
              "originalUrl" in request ? request.originalUrl : undefined,
              "url" in request ? request.url : undefined,
              "path" in request ? request.path : undefined,
            ];
            const rawPath = candidates.find(
              (value): value is string => typeof value === "string",
            );
            const path = rawPath?.split("?")[0];
            if (path) {
              span.updateName(`${request.method} ${path}`);
            }
          },
        }),
        new GrpcInstrumentation(),
        // Native `fetch` (used by openai / @anthropic-ai/sdk / Vertex AI
        // SDKs) goes through undici, which the http instrumentation does
        // not patch. The shared helper sets `peer.service` so Tempo's
        // service_graphs processor renders OpenAI / Anthropic / Vertex
        // as external-service edges in the service map.
        createUndiciInstrumentation(),
      ],
    })
  : undefined;
