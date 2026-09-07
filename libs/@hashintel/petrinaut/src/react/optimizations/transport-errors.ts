/**
 * Reading the structured fields off an optimization transport failure, and
 * turning one into a message a user can act on.
 */

import type {
  OptimizationErrorCategory,
  OptimizationErrorDiagnostics,
} from "./context";

const ERROR_CATEGORIES = new Set<OptimizationErrorCategory>([
  "network",
  "http",
  "protocol",
  "aborted",
]);

export type ClassifiedError = {
  category: OptimizationErrorCategory;
  /** Seconds from a `Retry-After` header, when the service sent one (429). */
  retryAfter: number | null;
  diagnostics: OptimizationErrorDiagnostics;
};

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Read the structured fields off a classified transport error without
 * depending on the host bridge's class: the error crosses from the app into
 * this library, so it is duck-typed rather than matched with `instanceof`.
 */
export function classifyError(error: unknown): ClassifiedError | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const candidate = error as Record<string, unknown>;
  if (
    typeof candidate.category !== "string" ||
    !ERROR_CATEGORIES.has(candidate.category as OptimizationErrorCategory)
  ) {
    return null;
  }
  return {
    category: candidate.category as OptimizationErrorCategory,
    retryAfter:
      typeof candidate.retryAfter === "number" ? candidate.retryAfter : null,
    diagnostics: {
      hashRequestId:
        typeof candidate.hashRequestId === "string"
          ? candidate.hashRequestId
          : null,
      optimizationRunId:
        typeof candidate.optimizationRunId === "string"
          ? candidate.optimizationRunId
          : null,
      httpStatus:
        typeof candidate.httpStatus === "number" ? candidate.httpStatus : null,
    },
  };
}

/**
 * Every way a run's own cancellation reaches us as a thrown value: the local
 * signal already aborted, the host threw an `AbortError`, or the bridge
 * classified the failure as `aborted`. One predicate so run creation and the
 * attach loop cannot disagree about what counts as a cancellation.
 */
export const isAbortFailure = (
  error: unknown,
  classified: ClassifiedError | null,
  aborted: boolean,
): boolean =>
  aborted || isAbortError(error) || classified?.category === "aborted";

/** Build a safe, actionable message from a classified failure. */
export function buildErrorMessage(
  classified: ClassifiedError,
  progress: { completedTrials: number; requestedTrials: number },
): string {
  const after = `after ${progress.completedTrials} of ${progress.requestedTrials} trials`;
  const { httpStatus, optimizationRunId, hashRequestId } =
    classified.diagnostics;
  const diagnosticId = optimizationRunId ?? hashRequestId;
  const diagnostic = diagnosticId ? ` (diagnostic id: ${diagnosticId})` : "";

  switch (classified.category) {
    case "http":
      if (httpStatus === 429) {
        return `The optimization service is busy — another optimization may already be running for your account.${
          classified.retryAfter === null
            ? ""
            : ` Try again in ~${classified.retryAfter}s.`
        }${diagnostic}`;
      }
      return `The optimization service rejected the request${
        httpStatus === null ? "" : ` (status ${httpStatus})`
      } ${after}. Retry the optimization.${diagnostic}`;
    case "protocol":
      return `The optimization stream ended unexpectedly ${after}. Retry the optimization.${diagnostic}`;
    case "aborted":
      return "The optimization was cancelled.";
    case "network":
    default:
      return `Connection to the optimization service was interrupted ${after}. Retry the optimization.${diagnostic}`;
  }
}
