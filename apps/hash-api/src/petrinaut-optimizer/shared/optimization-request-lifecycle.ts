import type { Request, Response as ExpressResponse } from "express";

export const RESPONSE_START_TIMEOUT_MS = 30_000;
export const DOWNSTREAM_HEARTBEAT_INTERVAL_MS = 25_000;
export const IDLE_TIMEOUT_MS = 5 * 60_000;
export const OVERALL_TIMEOUT_MS = 15 * 60_000;

export type OptimizationTimeoutKind = "response_start" | "idle" | "overall";

export type OptimizationRequestLifecycle = {
  /** Signal that cancels the upstream optimizer request. */
  signal: AbortSignal;
  /** Mutable outcome needed when translating a stream failure. */
  state: {
    clientDisconnected: boolean;
    terminalEventSent: boolean;
    timeoutKind: OptimizationTimeoutKind | null;
  };
  /** Stop timers, heartbeats, and request/response listeners. */
  cleanup: () => void;
  /** Clear the response-start deadline and begin idle/heartbeat tracking. */
  markResponseStarted: () => void;
  /** Remember that the public stream already contains its terminal event. */
  markTerminalEvent: () => void;
  /** Restart the deadline for receiving upstream bytes. */
  resetIdleTimeout: () => void;
};

/** Track cancellation, deadlines, and cleanup for one streamed request. */
export const createOptimizationRequestLifecycle = (
  request: Request,
  response: ExpressResponse,
): OptimizationRequestLifecycle => {
  const abortController = new AbortController();
  const state: OptimizationRequestLifecycle["state"] = {
    clientDisconnected: false,
    terminalEventSent: false,
    timeoutKind: null,
  };
  let downstreamHeartbeat: ReturnType<typeof setInterval> | undefined;
  let idleTimeout: ReturnType<typeof setTimeout> | undefined;

  /** Abort the upstream request after the HASH client disconnects. */
  const abortForClientDisconnect = () => {
    state.clientDisconnected = true;
    abortController.abort();
  };

  /** Record a timeout category and abort the upstream request. */
  const abortForTimeout = (kind: OptimizationTimeoutKind) => {
    state.timeoutKind ??= kind;
    abortController.abort();
  };

  const responseStartTimeout = setTimeout(
    () => abortForTimeout("response_start"),
    RESPONSE_START_TIMEOUT_MS,
  );
  const overallTimeout = setTimeout(
    () => abortForTimeout("overall"),
    OVERALL_TIMEOUT_MS,
  );

  /** Restart the inactivity deadline after any upstream bytes arrive. */
  const resetIdleTimeout = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => abortForTimeout("idle"), IDLE_TIMEOUT_MS);
  };

  request.once("aborted", abortForClientDisconnect);
  response.once("close", abortForClientDisconnect);

  return {
    signal: abortController.signal,
    state,
    cleanup: () => {
      clearTimeout(responseStartTimeout);
      clearInterval(downstreamHeartbeat);
      clearTimeout(idleTimeout);
      clearTimeout(overallTimeout);
      request.off("aborted", abortForClientDisconnect);
      response.off("close", abortForClientDisconnect);
    },
    markResponseStarted: () => {
      clearTimeout(responseStartTimeout);
      resetIdleTimeout();
      downstreamHeartbeat = setInterval(() => {
        if (
          !response.destroyed &&
          !response.writableEnded &&
          !response.writableNeedDrain
        ) {
          // Blank NDJSON lines are transport heartbeats, not domain events.
          response.write("\n");
        }
      }, DOWNSTREAM_HEARTBEAT_INTERVAL_MS);
      downstreamHeartbeat.unref();
    },
    markTerminalEvent: () => {
      state.terminalEventSent = true;
    },
    resetIdleTimeout,
  };
};
