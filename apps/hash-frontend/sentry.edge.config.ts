import * as Sentry from "@sentry/nextjs";

import { buildStamp } from "./buildstamp";
import { SENTRY_DSN, VERCEL_ENV } from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: VERCEL_ENV,
  release: buildStamp,
  // release is set in next.config.js in the Sentry webpack plugin
  /** @todo reduce perf sample rate from 100% when we have more traffic */
  tracesSampleRate: 1.0,
});
