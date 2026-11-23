import * as Sentry from "@sentry/nextjs";

import { buildStamp } from "./buildstamp";
import { isProduction } from "./src/lib/config";
import { SENTRY_DSN, SENTRY_ENVIRONMENT } from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  attachStacktrace: false,
  dataCollection: { cookies: false, httpBodies: [] },
  environment: SENTRY_ENVIRONMENT,
  release: buildStamp,
  traceLifecycle: "static",
  // release is set in next.config.js in the Sentry webpack plugin
  tracesSampleRate: isProduction ? 1.0 : 0,
});
