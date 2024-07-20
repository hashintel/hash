import * as Sentry from "@sentry/nextjs";

import { buildStamp } from "./buildstamp";
import { SENTRY_DSN, VERCEL_ENV } from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: VERCEL_ENV || "development",
  release: buildStamp,
  // release is set in next.config.js in the Sentry webpack plugin
  /** @todo Reduce perf sample rate from 100% when we have more traffic */
  tracesSampleRate: 1.0,
});
