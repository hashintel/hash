import * as Sentry from "@sentry/react";

// Get Sentry DSN from environment variable (optional for demo)
// Vite provides import.meta.env, but TypeScript needs help with the types
const metaEnv = (import.meta as { env?: Record<string, unknown> }).env;

const sentryDsn =
  typeof metaEnv?.SENTRY_DSN === "string" ? metaEnv.SENTRY_DSN : undefined;

const environment =
  typeof metaEnv?.MODE === "string" ? metaEnv.MODE : "development";

Sentry.init({
  dsn: sentryDsn,
  enabled: environment === "production",
  environment,
  integrations: [
    Sentry.browserApiErrorsIntegration(),
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: environment === "production" ? 1.0 : 0,
});
