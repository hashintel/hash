/** Required to load environment variables */
import "@local/hash-backend-utils/environment";

import * as Sentry from "@sentry/node";

import { isProdEnv } from "./lib/env-config";

// Initialize OpenTelemetry BEFORE any app code
const otlpEndpoint = process.env.HASH_OTLP_ENDPOINT;
if (otlpEndpoint) {
  const { registerOpenTelemetry } = await import("./graphql/opentelemetry.js");
  registerOpenTelemetry(
    otlpEndpoint,
    process.env.OTEL_SERVICE_NAME || "Node API",
  );
}

const sentryDsn = process.env.NODE_API_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  environment:
    process.env.SENTRY_ENVIRONMENT ||
    (isProdEnv ? "production" : "development"),
  sendDefaultPii: true,
  tracesSampleRate: isProdEnv ? 1.0 : 0,
});
