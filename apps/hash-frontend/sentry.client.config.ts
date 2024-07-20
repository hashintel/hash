// This file configures the initialization of Sentry on the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { buildStamp } from "./buildstamp";
import {
  SENTRY_DSN,
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
  VERCEL_ENV,
} from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: VERCEL_ENV || "development",
  integrations: [new Sentry.Replay({ stickySession: true })],
  release: buildStamp,
  replaysOnErrorSampleRate: 1,
  replaysSessionSampleRate: parseFloat(
    SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? "0",
  ),
  // release is set in next.config.js in the Sentry webpack plugin
  /** @todo Reduce perf sample rate from 100% when we have more traffic */
  tracesSampleRate: 1.0,
});
