/**
 * @layerRoot website.telemetry
 * @role Sentry initialisation and the error-tracker provider the app mounts
 */

import * as Sentry from "@sentry/react";

import { stripSnapshotLinks } from "./strip-snapshot-links";

Sentry.init({
  dsn: __SENTRY_DSN__,
  enabled: __ENVIRONMENT__ === "production",
  environment: __ENVIRONMENT__,
  beforeBreadcrumb: stripSnapshotLinks,
  beforeSend: stripSnapshotLinks,
  beforeSendTransaction: stripSnapshotLinks,
  beforeSendSpan: stripSnapshotLinks,
  integrations: [
    Sentry.browserApiErrorsIntegration(),
    Sentry.browserTracingIntegration(),
    Sentry.feedbackIntegration({
      autoInject: false,
      colorScheme: "system",
      formTitle: "Give feedback",
      messagePlaceholder: "Report a bug or suggest an improvement",
      submitButtonLabel: "Submit feedback",
    }),
  ],
  tracesSampleRate: __ENVIRONMENT__ === "production" ? 1.0 : 0,
});
