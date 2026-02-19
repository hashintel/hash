// This file configures the initialization of Sentry on the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { buildStamp } from "./buildstamp";
import { isProduction } from "./src/lib/config";
import {
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE,
} from "./src/lib/public-env";

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
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
  tracesSampleRate: isProduction ? 1.0 : 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
