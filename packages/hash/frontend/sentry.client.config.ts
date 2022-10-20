// This file configures the initialization of Sentry on the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { Replay } from "@sentry/replay";

const dsn = process.env.SENTRY_DSN;

const replaysSamplingRate = Number.parseInt(
  process.env.SENTRY_REPLAYS_SAMPLING_RATE ?? "0",
  10,
);

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "unset",
  integrations:
    replaysSamplingRate > 0 &&
    replaysSamplingRate <= 1 &&
    // @todo Remove when https://github.com/getsentry/sentry-replay/issues/246#issuecomment-1284472286 is resolved
    typeof window !== "undefined"
      ? [
          new Replay({
            captureOnlyOnError: true,
            replaysSamplingRate,
            stickySession: true,
          }),
        ]
      : [],
  // release is set in next.config.js in the Sentry webpack plugin
  /** @todo reduce perf sample rate from 100% when we have more traffic */
  tracesSampleRate: 1.0,
});
