// This file configures the initialization of Sentry on the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { BUILD_STAMP } from "./buildstamp";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const SENTRY_CONFIG = {
  dsn,
  enabled: !!dsn,
  release: BUILD_STAMP,
  /** @todo reduce perf sample rate from 100% when we have more traffic */
  tracesSampleRate: 1.0,
};

Sentry.init(SENTRY_CONFIG);
