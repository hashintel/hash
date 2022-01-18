// This file configures the initialization of Sentry on the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const SENTRY_CONFIG = {
  dsn,
  enabled: !!dsn,
  environment:
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF === "main"
      ? "production"
      : "development",
  // release is set in next.config.js in the Sentry webpack plugin
  /** @todo reduce perf sample rate from 100% when we have more traffic */
  tracesSampleRate: 1.0,
};

Sentry.init(SENTRY_CONFIG);
