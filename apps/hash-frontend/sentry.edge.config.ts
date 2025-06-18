import * as Sentry from "@sentry/nextjs";

import { buildStamp } from "./buildstamp";
import { isProduction } from "./src/lib/config";
import { SENTRY_DSN, VERCEL_ENV } from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: VERCEL_ENV || "development",
  release: buildStamp,
  sendDefaultPii: true,
  // release is set in next.config.js in the Sentry webpack plugin
  tracesSampleRate: isProduction ? 1.0 : 0,
});
