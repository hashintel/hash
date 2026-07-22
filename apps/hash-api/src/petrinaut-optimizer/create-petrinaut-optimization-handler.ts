import { once } from "node:events";

import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";
import {
  openPetrinautOptimizationStream,
  PetrinautOptimizerHttpError,
} from "@local/petrinaut-optimizer-client";

import type { PetrinautOptimizationEvent } from "@hashintel/petrinaut-core";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type {
  Request,
  RequestHandler,
  Response as ExpressResponse,
} from "express";

const RESPONSE_START_TIMEOUT_MS = 30_000;
const DOWNSTREAM_HEARTBEAT_INTERVAL_MS = 25_000;
const IDLE_TIMEOUT_MS = 5 * 60_000;
const OVERALL_TIMEOUT_MS = 15 * 60_000;
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_VALIDATION_ISSUES = 5;
const MAX_VALIDATION_MESSAGE_LENGTH = 300;
// A trial repeats optimized parameter identifiers from the accepted manifest,
// so use the same bound rather than rejecting a valid large search space.
const MAX_EVENT_BYTES = MAX_REQUEST_BYTES;
const MAX_CONCURRENT_OPTIMIZATIONS = 4;
const INVALID_OPTIMIZATION_REQUEST = {
  code: "invalid_optimization_request",
  error: "Invalid optimization request",
} as const;

type OptimizationTimeoutKind = "response_start" | "idle" | "overall";
type OptimizationTerminalOutcome = "completed" | "upstream-error";

type OptimizationRequestLifecycle = {
  /** Signal that cancels the upstream optimizer request. */
  signal: AbortSignal;
  /** Mutable outcome needed when translating a stream failure. */
  state: {
    clientDisconnected: boolean;
    terminalOutcome: OptimizationTerminalOutcome | null;
    timeoutKind: OptimizationTimeoutKind | null;
  };
  /** Stop timers, heartbeats, and request/response listeners. */
  cleanup: () => void;
  /** Clear the response-start deadline and begin idle/heartbeat tracking. */
  markResponseStarted: () => void;
  /** Remember the domain outcome committed to the public stream. */
  markTerminalOutcome: (outcome: OptimizationTerminalOutcome) => void;
  /** Restart the deadline for receiving upstream bytes. */
  resetIdleTimeout: () => void;
};

/** Track cancellation, deadlines, and cleanup for one streamed request. */
const createOptimizationRequestLifecycle = (
  request: Request,
  response: ExpressResponse,
): OptimizationRequestLifecycle => {
  const abortController = new AbortController();
  const state: OptimizationRequestLifecycle["state"] = {
    clientDisconnected: false,
    terminalOutcome: null,
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
    markTerminalOutcome: (outcome) => {
      state.terminalOutcome = outcome;
    },
    resetIdleTimeout,
  };
};

/** Return a bounded, transport-stable summary of manifest validation errors. */
const summarizeValidationIssues = (
  issues: readonly { message: string; path: readonly PropertyKey[] }[],
) => ({
  issues: issues.slice(0, MAX_VALIDATION_ISSUES).map(({ message, path }) => ({
    path: path.map(String).join(".") || "$",
    message: message.slice(0, MAX_VALIDATION_MESSAGE_LENGTH),
  })),
  truncated: issues.length > MAX_VALIDATION_ISSUES,
});

/** Write one canonical optimization event as NDJSON with backpressure. */
const writeOptimizationEvent = async (
  response: ExpressResponse,
  event: PetrinautOptimizationEvent,
  signal: AbortSignal,
): Promise<void> => {
  // This is schema-validated NDJSON served with `nosniff`, never HTML.
  // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write
  if (response.write(`${JSON.stringify(event)}\n`)) {
    return;
  }
  if (response.destroyed || response.writableEnded) {
    throw new Error("The optimization client disconnected");
  }
  if (signal.aborted) {
    throw new Error("The optimization request was aborted");
  }
  // Aborting this controller removes whichever listeners lost the race, so a
  // backpressured stream cannot accumulate `drain`/`close` listeners and the
  // loser can never surface a late unhandled rejection.
  const waitCleanup = new AbortController();
  try {
    await Promise.race([
      once(response, "drain", { signal: waitCleanup.signal }),
      once(response, "close", { signal: waitCleanup.signal }).then(() => {
        throw new Error("The optimization client disconnected");
      }),
      once(signal, "abort", { signal: waitCleanup.signal }).then(() => {
        throw new Error("The optimization request was aborted");
      }),
    ]);
  } finally {
    waitCleanup.abort();
  }
};

/**
 * Write a final event without waiting for backpressure to clear.
 *
 * Teardown must never block on a stalled client, so this write is
 * best-effort: the response ends immediately afterwards either way.
 */
const writeTerminalOptimizationEventBestEffort = (
  response: ExpressResponse,
  event: PetrinautOptimizationEvent,
): void => {
  if (response.destroyed || response.writableEnded) {
    return;
  }
  // This is schema-validated NDJSON served with `nosniff`, never HTML.
  // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write
  response.write(`${JSON.stringify(event)}\n`);
};

/** Forward canonical optimization events as NDJSON. */
const forwardOptimizationEvents = async (
  events: AsyncIterable<PetrinautOptimizationEvent>,
  response: ExpressResponse,
  markTerminalOutcome: (outcome: OptimizationTerminalOutcome) => void,
  signal: AbortSignal,
): Promise<OptimizationTerminalOutcome> => {
  for await (const event of events) {
    const terminalOutcome =
      event.type === "complete"
        ? "completed"
        : event.type === "error"
          ? "upstream-error"
          : null;
    const backpressureWait = writeOptimizationEvent(response, event, signal);
    if (terminalOutcome !== null) {
      // The write is committed synchronously even when the buffer is full,
      // so preserve its domain outcome even if a later backpressure wait is
      // interrupted by a timeout or downstream disconnect.
      markTerminalOutcome(terminalOutcome);
    }
    await backpressureWait;
    if (terminalOutcome !== null) {
      return terminalOutcome;
    }
  }
  throw new Error("The optimizer stream ended without a terminal event");
};

/** Create the authenticated endpoint that proxies optimization studies. */
export const createPetrinautOptimizationHandler = ({
  fetchImpl,
  logger,
  origin,
}: {
  fetchImpl: PetrinautOptimizerFetch;
  logger: Pick<Logger, "info" | "warn">;
  origin: URL | null;
}): RequestHandler => {
  let activeOptimizationCount = 0;
  const activeUserIds = new Set<string>();

  return async (request, response) => {
    const startedAt = Date.now();
    const requestId = response.get("x-hash-request-id") ?? "";
    const logContext = requestId ? { requestId } : {};

    if (!request.user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!origin) {
      response
        .status(503)
        .json({ error: "Petrinaut optimizer is not configured" });
      return;
    }

    const userId = request.user.accountId;
    if (activeUserIds.has(userId)) {
      logger.warn("Petrinaut optimization rejected: account busy", {
        ...logContext,
        activeOptimizationCount,
      });
      response.status(429).json({
        error: "An optimization is already running for this account",
      });
      return;
    }
    if (activeOptimizationCount >= MAX_CONCURRENT_OPTIMIZATIONS) {
      logger.warn("Petrinaut optimization rejected: at capacity", {
        ...logContext,
        activeOptimizationCount,
        maxConcurrentOptimizations: MAX_CONCURRENT_OPTIMIZATIONS,
      });
      response.status(429).json({ error: "Petrinaut optimizer is busy" });
      return;
    }

    let serializedBody: unknown;
    try {
      serializedBody = JSON.stringify(request.body);
    } catch {
      response.status(400).json(INVALID_OPTIMIZATION_REQUEST);
      return;
    }
    if (typeof serializedBody !== "string") {
      response.status(400).json(INVALID_OPTIMIZATION_REQUEST);
      return;
    }
    if (Buffer.byteLength(serializedBody, "utf8") > MAX_REQUEST_BYTES) {
      response.status(413).json({ error: "Optimization request is too large" });
      return;
    }

    const input = petrinautOptimizationInputSchema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({
        ...INVALID_OPTIMIZATION_REQUEST,
        details: summarizeValidationIssues(input.error.issues),
      });
      return;
    }

    activeOptimizationCount += 1;
    activeUserIds.add(userId);
    const lifecycle = createOptimizationRequestLifecycle(request, response);
    let optimizationRunId: string | null = null;
    const logTerminalOutcome = (outcome: OptimizationTerminalOutcome) => {
      const terminalMetadata = {
        ...logContext,
        durationMs: Date.now() - startedAt,
        optimizationRunId,
        outcome,
      };
      if (outcome === "completed") {
        logger.info("Petrinaut optimization finished", terminalMetadata);
      } else {
        logger.warn("Petrinaut optimization failed", terminalMetadata);
      }
    };

    try {
      const upstream = await openPetrinautOptimizationStream({
        endpoint: new URL("/optimize/all", origin),
        fetchImpl,
        input: input.data,
        maxEventBytes: MAX_EVENT_BYTES,
        onActivity: lifecycle.resetIdleTimeout,
        ...(requestId ? { requestId } : {}),
        signal: lifecycle.signal,
      });
      optimizationRunId = upstream.optimizationRunId;
      logger.info("Petrinaut optimization stream opened", {
        ...logContext,
        optimizationRunId,
      });

      response.status(200);
      response.set({
        "Cache-Control": "no-cache, no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
        // Expose the optimizer's run id so a browser can correlate this
        // response with NodeAPI and optimizer logs when the stream fails.
        ...(optimizationRunId === null
          ? {}
          : { "X-Optimization-Run-ID": optimizationRunId }),
      });
      response.flushHeaders();
      lifecycle.markResponseStarted();
      const outcome = await forwardOptimizationEvents(
        upstream.events,
        response,
        lifecycle.markTerminalOutcome,
        lifecycle.signal,
      );
      response.end();
      logTerminalOutcome(outcome);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      // A study that fails before its stream opens still has a run id on the
      // optimizer's error response; keep it so the failure log correlates.
      if (
        optimizationRunId === null &&
        error instanceof PetrinautOptimizerHttpError
      ) {
        optimizationRunId = error.optimizationRunId;
      }
      if (lifecycle.state.terminalOutcome !== null) {
        logTerminalOutcome(lifecycle.state.terminalOutcome);
        if (!response.destroyed && !response.writableEnded) {
          response.end();
        }
        return;
      }
      if (lifecycle.state.clientDisconnected || response.destroyed) {
        logger.info("Petrinaut optimization finished", {
          ...logContext,
          durationMs,
          optimizationRunId,
          outcome: "client-disconnected",
        });
        return;
      }
      logger.warn("Petrinaut optimization failed", {
        ...logContext,
        durationMs,
        errorType: error instanceof Error ? error.name : typeof error,
        optimizationRunId,
        outcome: lifecycle.state.timeoutKind
          ? `timeout:${lifecycle.state.timeoutKind}`
          : "upstream-error",
        timeoutKind: lifecycle.state.timeoutKind,
        upstreamStatus:
          error instanceof PetrinautOptimizerHttpError ? error.status : null,
      });
      if (!response.headersSent) {
        if (optimizationRunId !== null) {
          response.set({ "X-Optimization-Run-ID": optimizationRunId });
        }
        if (
          error instanceof PetrinautOptimizerHttpError &&
          error.status === 429
        ) {
          if (error.retryAfter) {
            response.set({ "Retry-After": error.retryAfter });
          }
          response.status(429).json({ error: "Petrinaut optimizer is busy" });
        } else {
          response.status(lifecycle.state.timeoutKind ? 504 : 502).json({
            error: lifecycle.state.timeoutKind
              ? "Petrinaut optimization timed out"
              : "Petrinaut optimization failed",
          });
        }
        return;
      }
      try {
        writeTerminalOptimizationEventBestEffort(response, {
          type: "error",
          code: lifecycle.state.timeoutKind
            ? "optimization_timeout"
            : "upstream_stream_error",
          message: lifecycle.state.timeoutKind
            ? "The optimization exceeded its execution time limit"
            : "The optimizer stream ended unexpectedly",
          retryable: true,
        } satisfies PetrinautOptimizationEvent);
      } catch (writeError) {
        logger.warn("Could not report Petrinaut optimization failure", {
          ...logContext,
          error: writeError,
          optimizationRunId,
        });
      }
      if (!response.writableEnded) {
        response.end();
      }
    } finally {
      lifecycle.cleanup();
      activeOptimizationCount -= 1;
      activeUserIds.delete(userId);
    }
  };
};
