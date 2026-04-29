/** Required to load environment variables */
import "@local/hash-backend-utils/environment";

import {
  createUndiciInstrumentation,
  httpRequestSpanNameHook,
  registerOpenTelemetry,
} from "@local/hash-backend-utils/opentelemetry";
import {
  ExpressInstrumentation,
  ExpressLayerType,
} from "@opentelemetry/instrumentation-express";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import * as Sentry from "@sentry/node";

import { isProdEnv } from "./lib/env-config";

/**
 * OpenTelemetry setup handle, exported so `index.ts` can wire
 * `shutdown()` into the GracefulShutdown chain. `undefined` when
 * `HASH_OTLP_ENDPOINT` is unset (no collector configured) or when
 * bootstrap throws.
 *
 * @type {import("@local/hash-backend-utils/opentelemetry").OpenTelemetrySetup | undefined}
 */
export const otelSetup = (() => {
  const otlpEndpoint = process.env.HASH_OTLP_ENDPOINT;
  if (!otlpEndpoint) {
    return undefined;
  }
  try {
    return registerOpenTelemetry({
      endpoint: otlpEndpoint,
      serviceName: process.env.OTEL_SERVICE_NAME || "Node API",
      instrumentations: [
        new HttpInstrumentation({
          // Don't trace the OTLP exporter's own outgoing requests — every
          // export would create a span that needs to be exported, recursively.
          ignoreOutgoingRequestHook: (options) => options.port === 4317,
          requestHook: httpRequestSpanNameHook,
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
  } catch (error) {
    // Bootstrap runs before the application logger is wired up, so direct
    // stderr is the right channel. Do not rethrow: the service should
    // still start without telemetry rather than crash on a misconfigured
    // collector.
    // eslint-disable-next-line no-console
    console.error(
      "OpenTelemetry bootstrap failed; service will start without telemetry.",
      error,
    );
    return undefined;
  }
})();

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
  // Skip Sentry's tracer setup only when our v2 provider actually
  // registered. Gating on `otlpEndpoint` instead would skip Sentry's
  // setup whenever the env var is set even if our bootstrap threw,
  // leaving the process with neither tracer.
  skipOpenTelemetrySetup: !!otelSetup,
});
