import * as Sentry from "@sentry/react";
import { useMemo } from "react";

import {
  type ErrorTracker,
  type ErrorTrackerCaptureContext,
  ErrorTrackerContext,
} from "@hashintel/petrinaut/react";

export type ErrorTrackerEnvironment = "development" | "production" | "test";

type CaptureTags = Record<string, string | number | boolean>;

export interface ErrorTrackerSinks {
  /** Forward the original error with tags; `redact` runs on that event only. */
  readonly captureException: (
    error: unknown,
    tags: CaptureTags,
    redact: (event: Sentry.ErrorEvent) => Sentry.ErrorEvent,
  ) => void;
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

const REDACTED = "[redacted]";

/**
 * Strip the human-readable text from one Sentry event while keeping its
 * exception types and stack frames. Messages on this path may quote
 * conversation content; stacks and types are how the event stays groupable
 * and debuggable.
 */
export const redactEventMessages = (
  event: Sentry.ErrorEvent,
): Sentry.ErrorEvent => ({
  ...event,
  ...(event.message === undefined ? {} : { message: REDACTED }),
  ...(event.exception?.values === undefined
    ? {}
    : {
        exception: {
          ...event.exception,
          values: event.exception.values.map((value) => ({
            ...value,
            ...(value.value === undefined ? {} : { value: REDACTED }),
          })),
        },
      }),
});

const sentrySinks: ErrorTrackerSinks = {
  captureException: (error, tags, redact) => {
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      scope.addEventProcessor((event) => redact(event as Sentry.ErrorEvent));
      Sentry.captureException(error);
    });
  },
  // eslint-disable-next-line no-console -- development-only diagnostic sink
  consoleError: (...data) => console.error(...data),
};

/**
 * Development prints the original error and stack to the browser console so
 * a failure is attributable while it happens. Production forwards the original
 * error to Sentry with source and classification tags, redacting only its
 * message text so stacks and grouping survive. Tests stay silent.
 */
export const createErrorTracker = (
  environment: ErrorTrackerEnvironment,
  sinks: ErrorTrackerSinks = sentrySinks,
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
          error,
          { ...context?.tags, source, "error.type": classifyError(error) },
          redactEventMessages,
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
