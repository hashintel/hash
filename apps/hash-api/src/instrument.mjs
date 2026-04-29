/** Required to load environment variables */
import "@local/hash-backend-utils/environment";

import * as Sentry from "@sentry/node";

import { isProdEnv } from "./lib/env-config";

// Initialize OpenTelemetry BEFORE any app code. The setup handle is
// retrievable via `getActiveOpenTelemetrySetup()` so `index.ts` can
// wire `shutdown()` into the GracefulShutdown chain — without it,
// in-flight OTLP exports are lost on SIGTERM.
const otlpEndpoint = process.env.HASH_OTLP_ENDPOINT;
if (otlpEndpoint) {
  const { createUndiciInstrumentation, registerOpenTelemetry } = await import(
    "@local/hash-backend-utils/opentelemetry"
  );
  const [
    { HttpInstrumentation },
    { ExpressInstrumentation, ExpressLayerType },
    { GraphQLInstrumentation },
  ] = await Promise.all([
    import("@opentelemetry/instrumentation-http"),
    import("@opentelemetry/instrumentation-express"),
    import("@opentelemetry/instrumentation-graphql"),
  ]);

  registerOpenTelemetry({
    endpoint: otlpEndpoint,
    serviceName: process.env.OTEL_SERVICE_NAME || "Node API",
    instrumentations: [
      new HttpInstrumentation({
        ignoreOutgoingRequestHook: (options) => options.port === 4317,
        // The default span name is just `HTTP POST` etc. Replace with
        // `METHOD /path`. Incoming requests (IncomingMessage) expose
        // `originalUrl` (Express) or `url`; outgoing requests
        // (ClientRequest) expose `path`. Cover both so neither side
        // ends up with a bare `POST` span name.
        requestHook: (span, request) => {
          if (!("method" in request) || !request.method) {
            return;
          }
          const rawPath =
            ("originalUrl" in request && request.originalUrl) ||
            ("url" in request && request.url) ||
            ("path" in request && request.path) ||
            "";
          // Strip query string to keep cardinality bounded.
          const path = String(rawPath).split("?")[0];
          if (path) {
            span.updateName(`${request.method} ${path}`);
          }
        },
      }),
      new ExpressInstrumentation({
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
      }),
      new GraphQLInstrumentation({
        allowValues: true,
        depth: 5,
        mergeItems: true,
        ignoreTrivialResolveSpans: true,
      }),
      // Native `fetch` (used by openai SDK and outbound API calls in
      // resolvers) goes through undici, which the http instrumentation
      // does not patch. The shared helper sets `peer.service` so
      // Tempo's service_graphs processor renders external dependencies
      // as edges in the service map.
      createUndiciInstrumentation(),
    ],
  });
}

const sentryDsn = process.env.NODE_API_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  environment:
    process.env.SENTRY_ENVIRONMENT ||
    process.env.ENVIRONMENT ||
    (isProdEnv ? "production" : "development"),
  sendDefaultPii: true,
  tracesSampleRate: isProdEnv ? 1.0 : 0,
  // When OTEL is configured we already have a global TracerProvider
  // wired up to OTLP. Tell Sentry to share it instead of registering its
  // own — otherwise Sentry hijacks the global provider and the
  // OpenTelemetryWorkflowClientInterceptor that injects trace context
  // into Temporal workflow headers ends up running on a non-functional
  // tracer, breaking caller→workflow→activity correlation.
  skipOpenTelemetrySetup: !!otlpEndpoint,
});
