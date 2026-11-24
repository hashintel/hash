/**
 * @layerRoot website.telemetry
 * @role Sentry initialisation and the error-tracker provider the app mounts
 */

import * as Sentry from "@sentry/react";

import { isWorkerLoadFailure } from "./is-worker-load-failure";
import { stripSnapshotLinks } from "./strip-snapshot-links";

const piiKeySnippets = ["forwarded", "-ip", "remote-", "via", "-user"];

Sentry.init({
  dsn: __SENTRY_DSN__,
  enabled: __ENVIRONMENT__ === "production",
  environment: __ENVIRONMENT__,
  // Monaco's `CancellationError`, which it raises when it cancels its own
  // pending work, such as when an editor unmounts.
  ignoreErrors: [/^Canceled: Canceled$/],
  attachStacktrace: false,
  dataCollection: {
    userInfo: false,
    cookies: { deny: piiKeySnippets },
    httpHeaders: {
      request: { deny: piiKeySnippets },
      response: { deny: piiKeySnippets },
    },
    httpBodies: [],
    urlQueryParams: { deny: piiKeySnippets },
    frameContextLines: 7,
  },
  beforeBreadcrumb: stripSnapshotLinks,
  beforeSend: (event, hint) =>
    isWorkerLoadFailure(hint.originalException)
      ? null
      : stripSnapshotLinks(event),
  beforeSendTransaction: stripSnapshotLinks,
  beforeSendSpan: Sentry.withStaticSpan(stripSnapshotLinks),
  traceLifecycle: "static",
  integrations: [
    Sentry.browserApiErrorsIntegration(),
    Sentry.browserSessionIntegration({ lifecycle: "route" }),
    Sentry.browserTracingIntegration(),
    Sentry.userTimingIntegration(),
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
