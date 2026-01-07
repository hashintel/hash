import * as Sentry from "@sentry/react";

// Get Sentry DSN from environment variable (injected at build time via vite.config.ts)
// The value is read from .env files and exposed via import.meta.env.SENTRY_DSN
const sentryDsn =
  typeof import.meta.env.SENTRY_DSN === "string"
    ? import.meta.env.SENTRY_DSN
    : undefined;

const environment =
  typeof import.meta.env.MODE === "string"
    ? import.meta.env.MODE
    : "development";

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
