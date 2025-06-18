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
  enabled: !!SENTRY_DSN,
  environment: VERCEL_ENV || "development",
  integrations: [
    Sentry.browserApiErrorsIntegration(),
    Sentry.browserProfilingIntegration(),
    Sentry.browserSessionIntegration(),
    Sentry.browserTracingIntegration(),
    Sentry.graphqlClientIntegration({
      endpoints: [/\/graphql$/],
    }),
    Sentry.replayIntegration(),
  ],
  release: buildStamp,
  replaysOnErrorSampleRate: 1,
  replaysSessionSampleRate: parseFloat(
    SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? "0",
  ),
  sendDefaultPii: true,
  tracePropagationTargets: ["localhost", /^https:\/\/(?:.*\.)?hash\.ai/],
  tracesSampleRate: 1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
};
