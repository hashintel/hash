// Sentry is only used in the demo site, which is bundled by Vite,
// so we can keep @sentry/react a dev dependency.
// eslint-disable-next-line import/no-extraneous-dependencies
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: __SENTRY_DSN__,
  enabled: __ENVIRONMENT__ === "production",
  environment: __ENVIRONMENT__,
  integrations: [
    Sentry.browserApiErrorsIntegration(),
    Sentry.browserTracingIntegration(),
    Sentry.feedbackIntegration({
      colorScheme: "system",
      triggerLabel: "",
      formTitle: "Give feedback",
      messagePlaceholder: "Report a bug or suggest an improvement",
      submitButtonLabel: "Submit feedback",
    }),
  ],
  tracesSampleRate: __ENVIRONMENT__ === "production" ? 1.0 : 0,
});
