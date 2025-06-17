import * as Sentry from "@sentry/node";

import { isProdEnv } from "./lib/env-config";

const sentryDsn = process.env.NODE_API_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  enabled: !!sentryDsn,
  environment: isProdEnv ? "production" : "development",
  tracesSampleRate: 1.0,
});
