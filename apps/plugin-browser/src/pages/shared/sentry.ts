import * as Sentry from "@sentry/browser";

import type { LocalStorage } from "../../shared/storage";

/**
 * Initialize Sentry. Run this as early as possible in the app.
 *
 * NOTE: will not work in background script until https://github.com/getsentry/sentry-javascript/issues/5289 is fixed
 */
export const initializeSentry = () =>
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !!SENTRY_DSN,
    environment: ENVIRONMENT,
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
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    tracePropagationTargets: ["localhost", /^https:\/\/(?:.*\.)?hash\.ai/],
    tracesSampleRate:
      ENVIRONMENT === "production"
        ? 1.0 /** @todo reduce perf sample rate from 100% when we have more traffic */
        : 0,
  });

export const setSentryUser = (user?: LocalStorage["user"] | null) => {
  const scope = Sentry.getCurrentScope();
  const sentryUser = scope.getUser();

  if (!user && sentryUser) {
    scope.setUser(null);
  } else if (user && sentryUser?.id !== user.metadata.recordId.entityId) {
    scope.setUser({
      id: user.metadata.recordId.entityId,
      email: user.properties.email[0],
    });
  }
};
