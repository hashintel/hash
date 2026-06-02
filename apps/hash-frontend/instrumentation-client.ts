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
import { installIframeErrorReporter } from "./src/pages/processes/shared/iframe-error-reporter";

/**
 * The Petrinaut embed page (`/processes/<uuid>/embed`) runs inside a
 * sandboxed null-origin iframe with `connect-src 'self'`. Sentry's
 * transport would be blocked by CSP and the resulting events would lack
 * the host's authenticated-user context anyway. Instead we install a
 * tiny reporter that forwards errors to the host over the postMessage
 * bridge, and the host's Sentry SDK captures them with iframe-specific
 * tags.
 */
const isPetrinautEmbedDocument =
  typeof window !== "undefined" &&
  /^\/processes\/[^/]+\/embed/.test(window.location.pathname);

if (isPetrinautEmbedDocument) {
  installIframeErrorReporter();
} else {
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
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
