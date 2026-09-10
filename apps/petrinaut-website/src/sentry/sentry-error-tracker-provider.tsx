import * as Sentry from "@sentry/react";
import { useMemo } from "react";

import {
  type ErrorTracker,
  type ErrorTrackerCaptureContext,
  ErrorTrackerContext,
} from "@hashintel/petrinaut/react";

export type ErrorTrackerEnvironment = "development" | "production" | "test";

interface ErrorTrackerSinks {
  readonly captureException: (
    error: unknown,
    hint: { readonly tags: Record<string, string | number | boolean> },
  ) => unknown;
  readonly consoleError: (...data: unknown[]) => void;
}

/** The error's class or code; never its message. */
const classifyError = (error: unknown): string => {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    return code ?? error.name;
  }
  return typeof error;
};

/**
 * Development prints the original error and stack to the browser console so
 * a failure is attributable while it happens. Production forwards only a
 * classified error plus the caller's tags to Sentry, so messages that may
 * quote conversation content never leave the browser. Tests stay silent.
 */
export const createErrorTracker = (
  environment: ErrorTrackerEnvironment,
  sinks: ErrorTrackerSinks = {
    captureException: (error, hint) => Sentry.captureException(error, hint),
    // eslint-disable-next-line no-console -- development-only diagnostic sink
    consoleError: (...data) => console.error(...data),
  },
): ErrorTracker => ({
  captureException: (error: unknown, context?: ErrorTrackerCaptureContext) => {
    const source = context?.source ?? "petrinaut";
    switch (environment) {
      case "development":
        sinks.consoleError(
          `[petrinaut] ${source} failed`,
          error,
          context?.tags,
        );
        return;
      case "production":
        sinks.captureException(
          new Error(`${source}: ${classifyError(error)}`),
          {
            tags: {
              ...context?.tags,
              source,
              "error.type": classifyError(error),
            },
          },
        );
        return;
      case "test":
        return;
    }
  },
});

const resolveEnvironment = (): ErrorTrackerEnvironment => {
  if (import.meta.env.MODE === "test") return "test";
  return typeof __ENVIRONMENT__ === "string" && __ENVIRONMENT__ === "production"
    ? "production"
    : "development";
};

/**
 * Provider that implements ErrorTrackerContext using Sentry
 */
export const SentryErrorTrackerProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const tracker = useMemo(() => createErrorTracker(resolveEnvironment()), []);
  return (
    <ErrorTrackerContext.Provider value={tracker}>
      {children}
    </ErrorTrackerContext.Provider>
  );
};
