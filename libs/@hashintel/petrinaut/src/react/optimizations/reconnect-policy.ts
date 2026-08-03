/**
 * When a detached run's event stream drops, whether to re-attach and how long
 * to wait first. Kept free of React and of the record store so the policy can
 * be read — and tested — without driving a provider through fake streams.
 */

import { isAbortFailure } from "./transport-errors";

import type { ClassifiedError } from "./transport-errors";

/** First reconnect delay after a dropped detached-run event stream. */
const RECONNECT_BASE_DELAY_MS = 1_000;
/** Ceiling for the exponential reconnect backoff. */
const RECONNECT_MAX_DELAY_MS = 30_000;
/**
 * Consecutive failed attachments (no event received in between) after which
 * reconnecting stops and the classified failure is surfaced instead.
 */
export const MAX_CONSECUTIVE_RECONNECT_FAILURES = 8;

/**
 * Gateway statuses a re-attach may transiently hit while the service
 * restarts or deploys; they reconnect within the same failure cap. Every
 * other http status (404 unknown run, other 4xx) is definitive.
 */
const RECONNECTABLE_HTTP_STATUSES = new Set([502, 503, 504]);

/** Exponential backoff: 1s, 2s, 4s, ... capped at 30s. */
export const reconnectDelayMs = (consecutiveFailures: number): number =>
  Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** (consecutiveFailures - 1),
    RECONNECT_MAX_DELAY_MS,
  );

/** Resolve after `ms`, or immediately once `signal` aborts. */
export const abortableDelay = (
  ms: number,
  signal: AbortSignal,
): Promise<void> =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    // The listener stays attached when the delay elapses normally: at most a
    // handful accumulate per run, and they die with the run's controller.
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * Whether resuming from the cursor could recover this failure. Replayed
 * events are deduplicated by `seq`, so re-attaching is always safe — the
 * question is only whether the run may still be live upstream.
 *
 * Four kinds of interruption qualify, all sharing the failure cap: `network`
 * failures, `protocol` failures (a proxy tearing an idle connection down
 * cleanly surfaces as a `protocol` "stream ended without a terminal event"),
 * NodeAPI-authored `retryable: true` error events (its per-attachment window
 * died while the run continues), and gateway `http` statuses (502/503/504 —
 * NodeAPI restarting or deploying). Every other `http` failure (404 unknown
 * run, other 4xx) is definitive, as are `retryable: false` error events.
 */
const isReconnectable = (
  classified: ClassifiedError | null,
  isRetryableInterruption: boolean,
): boolean =>
  isRetryableInterruption ||
  classified?.category === "network" ||
  classified?.category === "protocol" ||
  (classified?.category === "http" &&
    classified.diagnostics.httpStatus !== null &&
    RECONNECTABLE_HTTP_STATUSES.has(classified.diagnostics.httpStatus));

/** What the attach loop should do about a failure. */
export type AttachFailureDecision =
  /** The run's own cancellation; settle the record as cancelled. */
  | { kind: "cancelled" }
  /** The run already reached a terminal event; the failure changes nothing. */
  | { kind: "settled" }
  /** A stored run the service no longer knows; drop it without a trace. */
  | { kind: "expired" }
  /** Re-attach from the cursor after waiting this long. */
  | { kind: "reconnect"; delayMs: number }
  /** Out of reconnects, or never reconnectable; surface the failure. */
  | { kind: "giveUp" };

export type AttachFailureInput = {
  error: unknown;
  classified: ClassifiedError | null;
  /** A NodeAPI attachment window died while the run itself may continue. */
  isRetryableInterruption: boolean;
  /** The consumer asked to stop, so any failure is really a cancellation. */
  aborted: boolean;
  sawTerminalEvent: boolean;
  /** False when this attachment produced nothing before failing. */
  receivedAnyEvent: boolean;
  /** Set while re-attaching to a stored run that may have expired. */
  dropRecordOnNotFound: boolean;
  /** Failures in a row without an event in between, including this one. */
  consecutiveFailures: number;
};

/**
 * Classify one attach failure. Ordering matters: cancellation and a run that
 * already settled both outrank the reconnect logic, and a 404 on the first
 * attachment of a stored run means it expired rather than failed.
 */
export const decideAttachFailure = ({
  error,
  classified,
  isRetryableInterruption,
  aborted,
  sawTerminalEvent,
  receivedAnyEvent,
  dropRecordOnNotFound,
  consecutiveFailures,
}: AttachFailureInput): AttachFailureDecision => {
  if (isAbortFailure(error, classified, aborted)) {
    return { kind: "cancelled" };
  }
  if (sawTerminalEvent) {
    return { kind: "settled" };
  }
  if (
    dropRecordOnNotFound &&
    !receivedAnyEvent &&
    classified?.category === "http" &&
    classified.diagnostics.httpStatus === 404
  ) {
    return { kind: "expired" };
  }
  if (
    isReconnectable(classified, isRetryableInterruption) &&
    consecutiveFailures < MAX_CONSECUTIVE_RECONNECT_FAILURES
  ) {
    return {
      kind: "reconnect",
      delayMs: reconnectDelayMs(consecutiveFailures),
    };
  }
  return { kind: "giveUp" };
};
