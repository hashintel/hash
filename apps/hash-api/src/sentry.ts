import * as Sentry from "@sentry/node";

import { isProdEnv } from "./lib/env-config.js";

const sentryDsn = process.env.NODE_API_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  environment: isProdEnv ? "production" : "development",
  integrations: [
    // Listen to routes specified in `app`
    Sentry.expressIntegration(),
    Sentry.httpIntegration(),
    Sentry.graphqlIntegration(),
  ],

  tracesSampleRate: 1.0,
});
