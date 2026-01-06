import { createContext } from "react";

/**
 * Additional context that can be attached to error tracking
 */
export interface ErrorTrackerContextData {
  [key: string]: unknown;
}

/**
 * Generic error tracker interface designed to work with Sentry and other error tracking services
 */
export interface ErrorTracker {
  /**
   * Capture an exception/error
   * @param error - The error or exception to capture
   * @param context - Optional additional context to attach
   */
  captureException: (error: unknown, context?: ErrorTrackerContextData) => void;
}

export const ErrorTrackerContext = createContext<ErrorTracker>({
  captureException: () => {},
});
