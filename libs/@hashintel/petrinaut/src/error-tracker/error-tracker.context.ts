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

/**
 * Error tracker context value
 * This is a one-way interface for sending errors to tracking services.
 * For UI error display, use separate state management (e.g., error boundaries, toast notifications).
 */
export type ErrorTrackerContextType = ErrorTracker;

export const ErrorTrackerContext = createContext<ErrorTrackerContextType>({
  captureException: () => {},
});
