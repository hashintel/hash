import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  enabled: !!process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  tracesSampleRate: 1.0,
});
