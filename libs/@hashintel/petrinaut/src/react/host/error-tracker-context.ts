import { createContext } from "react";

/**
 * Where a captured failure came from and how to correlate it. Every value is
 * a classification or an opaque identifier; hosts decide what reaches their
 * tracker, so no field may carry user or model content.
 */
export interface ErrorTrackerCaptureContext {
  /** Dotted origin of the failure, e.g. `ai-assistant.stream`. */
  readonly source?: string;
  /** Opaque correlation identifiers and classifications. */
  readonly tags?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Generic error tracker interface designed to work with Sentry and other error tracking services
 */
export interface ErrorTracker {
  /**
   * Capture an exception/error
   * @param error - The error or exception to capture
   * @param context - Optional source and correlation for the capture
   */
  captureException: (
    error: unknown,
    context?: ErrorTrackerCaptureContext,
  ) => void;
}

export const ErrorTrackerContext = createContext<ErrorTracker>({
  captureException: () => {},
});
