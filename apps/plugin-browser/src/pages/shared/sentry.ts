import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import * as Sentry from "@sentry/browser";

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
      new Sentry.BrowserTracing({
        // Which URLs distributed tracing is enabled for
        tracePropagationTargets: ["localhost", /^https:\/\/(?:.*\.)?hash\.ai/],
      }),
    ],
    tracesSampleRate: 1.0, // Capture 100% of the transactions
  });

export const setSentryUser = (user?: User | null) => {
  Sentry.configureScope((scope) => {
    const sentryUser = scope.getUser();
    if (!user && sentryUser) {
      scope.setUser(null);
    } else if (user && sentryUser?.id !== user.metadata.recordId.entityId) {
      // @todo update when system types have fixed https://hash.ai URLs – H-828
      const primaryEmailKey = Object.keys(user.properties).find((key) =>
        key.includes("email"),
      );
      scope.setUser({
        id: user.metadata.recordId.entityId,
        email:
          user.properties[primaryEmailKey as keyof typeof user.properties]?.[0],
      });
    }
  });
};
