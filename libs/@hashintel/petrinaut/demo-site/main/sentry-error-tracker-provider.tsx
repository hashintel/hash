/* eslint-disable react/jsx-no-constructed-context-values */
import * as Sentry from "@sentry/react";

import {
  ErrorTrackerContext,
  type ErrorTrackerContextData,
} from "../../src/error-tracker/error-tracker.context";

/**
 * Provider that implements ErrorTrackerContext using Sentry
 */
export const SentryErrorTrackerProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  function captureException(error: unknown, context?: ErrorTrackerContextData) {
    Sentry.withScope((scope) => {
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          scope.setContext(key, value as Record<string, unknown>);
        }
      }
      Sentry.captureException(error);
    });
  }

  return (
    <ErrorTrackerContext.Provider value={{ captureException }}>
      {children}
    </ErrorTrackerContext.Provider>
  );
};
