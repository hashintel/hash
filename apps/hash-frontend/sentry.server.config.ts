import * as Sentry from "@sentry/node";

import { buildStamp } from "./buildstamp";
import { isProduction } from "./src/lib/config";
import { SENTRY_DSN, SENTRY_ENVIRONMENT } from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  release: buildStamp,
  sendDefaultPii: true,
  tracesSampleRate: isProduction ? 1.0 : 0,
});
