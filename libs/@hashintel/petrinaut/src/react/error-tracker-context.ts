import { createContext } from "react";

/**
 * Generic error tracker interface designed to work with Sentry and other error tracking services
 */
export interface ErrorTracker {
  /**
   * Capture an exception/error
   * @param error - The error or exception to capture
   */
  captureException: (error: unknown) => void;
}

export const ErrorTrackerContext = createContext<ErrorTracker>({
  captureException: () => {},
});
