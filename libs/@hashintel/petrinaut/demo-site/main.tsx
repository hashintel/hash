import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DevApp } from "./main/app";
import { SentryErrorTrackerProvider } from "./main/sentry-error-tracker-provider";

const root = createRoot(document.getElementById("root")!);

// Get Sentry DSN from environment variable (optional for demo)
// Vite provides import.meta.env, but TypeScript needs help with the types
const metaEnv = (import.meta as { env?: Record<string, unknown> }).env;
const sentryDsn =
  typeof metaEnv?.VITE_SENTRY_DSN === "string"
    ? metaEnv.VITE_SENTRY_DSN
    : undefined;
const environment =
  typeof metaEnv?.MODE === "string" ? metaEnv.MODE : "development";

Sentry.init({
  dsn: sentryDsn,
  enabled: true,
  environment,
  integrations: [
    Sentry.browserApiErrorsIntegration(),
    Sentry.browserTracingIntegration(),
  ],
  tracesSampleRate: environment === "production" ? 1.0 : 0,
});

root.render(
  <StrictMode>
    <SentryErrorTrackerProvider>
      <DevApp />
    </SentryErrorTrackerProvider>
  </StrictMode>,
);
