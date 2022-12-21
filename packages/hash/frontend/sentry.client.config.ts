// This file configures the initialization of Sentry on the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import {
  SENTRY_DSN,
  SENTRY_REPLAY_SESSION_SAMPLE_RATE,
  VERCEL_ENV,
} from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: VERCEL_ENV,
  integrations: SENTRY_REPLAY_SESSION_SAMPLE_RATE
    ? [
        new Sentry.Replay({
          errorSampleRate: 1,
          sessionSampleRate: parseFloat(SENTRY_REPLAY_SESSION_SAMPLE_RATE),
          stickySession: true,
        }),
      ]
    : [],
  // release is set in next.config.js in the Sentry webpack plugin
  /** @todo reduce perf sample rate from 100% when we have more traffic */
  tracesSampleRate: 1.0,
});
