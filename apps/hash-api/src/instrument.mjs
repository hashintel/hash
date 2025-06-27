/** Required to load environment variables */
import "@local/hash-backend-utils/environment";

import * as Sentry from "@sentry/node";

import { isProdEnv } from "./lib/env-config";

const sentryDsn = process.env.NODE_API_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  environment: isProdEnv ? "production" : "development",
  sendDefaultPii: true,
  tracesSampleRate: isProdEnv ? 1.0 : 0,
});
