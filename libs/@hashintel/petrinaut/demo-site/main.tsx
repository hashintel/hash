import "./sentry/instrument.js";

import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DevApp } from "./main/app";
import { SentryErrorTrackerProvider } from "./sentry/sentry-error-tracker-provider";

const root = createRoot(document.getElementById("root")!, {
  // Callback called when an error is thrown and not caught by an ErrorBoundary.
  onUncaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
    // eslint-disable-next-line no-console
    console.warn("Uncaught error", error, errorInfo.componentStack);
  }),

  // Callback called when React catches an error in an ErrorBoundary.
  onCaughtError: Sentry.reactErrorHandler(),

  // Callback called when React automatically recovers from errors.
  onRecoverableError: Sentry.reactErrorHandler(),
});

root.render(
  <StrictMode>
    <SentryErrorTrackerProvider>
      <DevApp />
    </SentryErrorTrackerProvider>
  </StrictMode>,
);
