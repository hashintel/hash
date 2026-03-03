import * as Sentry from "@sentry/react";

import { ErrorTrackerContext } from "../../src/error-tracker/error-tracker.context";

/**
 * Provider that implements ErrorTrackerContext using Sentry
 */
export const SentryErrorTrackerProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  function captureException(error: unknown) {
    Sentry.captureException(error);
  }

  return (
    <ErrorTrackerContext.Provider value={{ captureException }}>
      {children}
    </ErrorTrackerContext.Provider>
  );
};
