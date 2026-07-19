import {
  attachPetrinautOptimizationRunStream,
  PetrinautOptimizerHttpError,
} from "@local/petrinaut-optimizer-client";

import {
  forwardOptimizationEvents,
  writeTerminalOptimizationEventBestEffort,
} from "./shared/forward-optimization-events";
import { createOptimizationRequestLifecycle } from "./shared/optimization-request-lifecycle";
import {
  capPathSegment,
  MAX_EVENT_BYTES,
} from "./shared/validate-optimization-request";

import type { OptimizationRunOwners } from "./shared/optimization-run-owners";
import type { PetrinautOptimizationEvent } from "@hashintel/petrinaut-core";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

const RUN_NOT_FOUND = { error: "Optimization run not found" } as const;

/** Parse the replay cursor; `undefined` means the query was invalid. */
const parseCursor = (value: unknown): number | undefined => {
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== "string" || !/^\d{1,15}$/.test(value)) {
    return undefined;
  }
  return Number(value);
};

/**
 * Create the authenticated endpoint that attaches to a detached run's events.
 *
 * The response replays buffered events past `?cursor=` as NDJSON, then
 * live-tails new ones; each replayed line carries the upstream sequence
 * number as `seq` so the browser can re-attach from where it stopped.
 * Only the run's creator may attach; unknown run ids — including runs
 * another account owns — answer 404 without revealing whether they exist.
 *
 * Ownership is released only once the run's terminal event has been
 * *delivered*: after the forwarding loop resolves and the response ends, or
 * — in the failure path — when the terminal line was committed while the
 * client was still connected. A disconnect or failure racing the terminal
 * write keeps the entry, so one more attach can replay the terminal frame
 * from the optimizer's retained log (and release then). After that delivered
 * terminal, a subsequent attach answers 404 even though the optimizer could
 * still replay the finished log: the browser already holds every event.
 */
export const createPetrinautOptimizationRunEventsHandler = ({
  fetchImpl,
  logger,
  origin,
  runOwners,
}: {
  fetchImpl: PetrinautOptimizerFetch;
  logger: Pick<Logger, "child" | "info" | "warn">;
  origin: URL | null;
  runOwners: OptimizationRunOwners;
}): RequestHandler => {
  return async (request, response) => {
    const startedAt = Date.now();
    const requestId = response.get("x-hash-request-id") ?? "";
    const requestLogger = logger.child({ requestId });

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
    const runId = request.params.runId ?? "";
    // The run id is user-controlled until the ownership check passes.
    const loggedRunId = capPathSegment(runId);

    const owner = runOwners.get(runId);
    if (!owner || owner.accountId !== userId) {
      // 404 rather than 403: revealing that a run id exists but belongs to
      // someone else would leak information to id-guessing clients.
      requestLogger.warn("Petrinaut optimization run attach rejected", {
        optimizationRunId: loggedRunId,
        reason: owner ? "not-owner" : "unknown-run",
        userId,
      });
      response.status(404).json(RUN_NOT_FOUND);
      return;
    }

    const cursor = parseCursor(request.query.cursor);
    if (cursor === undefined) {
      requestLogger.warn("Petrinaut optimization run attach rejected", {
        optimizationRunId: loggedRunId,
        reason: "invalid-cursor",
        userId,
      });
      response.status(400).json({ error: "Invalid optimization cursor" });
      return;
    }

    requestLogger.info("Petrinaut optimization run attach requested", {
      cursor,
      optimizationRunId: runId,
      userId,
    });

    const lifecycle = createOptimizationRequestLifecycle(request, response);

    try {
      const upstream = await attachPetrinautOptimizationRunStream({
        endpoint: origin,
        runId,
        cursor,
        fetchImpl,
        maxEventBytes: MAX_EVENT_BYTES,
        onActivity: lifecycle.resetIdleTimeout,
        ...(requestId ? { requestId } : {}),
        // The manifest is long gone at attach time; the ownership entry
        // preserves the requested trial count for the synthesized summary,
        // and no direction is passed so `best` stays null (the browser keeps
        // its own running best across reconnections).
        requestedTrials: owner.requestedTrials,
        signal: lifecycle.signal,
      });
      requestLogger.info("Petrinaut optimization run attached", {
        cursor,
        optimizationRunId: runId,
        userId,
      });

      response.status(200);
      response.set({
        "Cache-Control": "no-cache, no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Optimization-Run-ID": runId,
      });
      response.flushHeaders();
      lifecycle.markResponseStarted();
      await forwardOptimizationEvents(
        upstream.events,
        response,
        lifecycle.markTerminalEvent,
        lifecycle.signal,
      );
      response.end();
      if (lifecycle.state.terminalEventSent) {
        // The terminal event was delivered (completed, failed, or cancelled
        // upstream): nothing is left to attach to or cancel.
        runOwners.release(runId);
      }
      requestLogger.info("Petrinaut optimization run attachment finished", {
        durationMs: Date.now() - startedAt,
        optimizationRunId: runId,
        outcome: "completed",
        userId,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (
        lifecycle.state.terminalEventSent &&
        !lifecycle.state.clientDisconnected &&
        !response.destroyed
      ) {
        // The terminal line was committed while the client stayed connected
        // (e.g. a timeout broke the final backpressure wait), so treat it as
        // delivered. A disconnect racing the terminal write keeps the entry
        // instead: one more attach replays the terminal frame from the
        // optimizer's retained log and releases then.
        runOwners.release(runId);
      }
      if (lifecycle.state.clientDisconnected || response.destroyed) {
        // The run itself is unaffected: the browser can simply re-attach.
        requestLogger.info("Petrinaut optimization run attachment finished", {
          durationMs,
          optimizationRunId: runId,
          outcome: "client-disconnected",
          userId,
        });
        return;
      }
      const runGoneUpstream =
        error instanceof PetrinautOptimizerHttpError && error.status === 404;
      if (runGoneUpstream) {
        // The optimizer no longer knows the run (expired or reaped), so the
        // ownership entry is stale; drop it so the account is not blocked.
        runOwners.release(runId);
      }
      requestLogger.warn("Petrinaut optimization run attachment failed", {
        durationMs,
        error,
        optimizationRunId: runId,
        outcome: lifecycle.state.timeoutKind
          ? `timeout:${lifecycle.state.timeoutKind}`
          : runGoneUpstream
            ? "run-gone"
            : "upstream-error",
        timeoutKind: lifecycle.state.timeoutKind,
        userId,
      });
      if (!response.headersSent) {
        if (runGoneUpstream) {
          response.status(404).json(RUN_NOT_FOUND);
        } else {
          response.status(lifecycle.state.timeoutKind ? 504 : 502).json({
            error: lifecycle.state.timeoutKind
              ? "Petrinaut optimization timed out"
              : "Petrinaut optimization failed",
          });
        }
        return;
      }
      if (!lifecycle.state.terminalEventSent) {
        try {
          // `retryable: true` tells the browser the run may still be live:
          // re-attach with the last seen `seq` as the cursor.
          writeTerminalOptimizationEventBestEffort(response, {
            type: "error",
            code: lifecycle.state.timeoutKind
              ? "optimization_timeout"
              : "upstream_stream_error",
            message: lifecycle.state.timeoutKind
              ? "The optimization stream attachment timed out"
              : "The optimizer stream ended unexpectedly",
            retryable: true,
          } satisfies PetrinautOptimizationEvent);
        } catch (writeError) {
          requestLogger.warn(
            "Could not report Petrinaut optimization run attachment failure",
            {
              error: writeError,
              optimizationRunId: runId,
            },
          );
        }
      }
      if (!response.writableEnded) {
        response.end();
      }
    } finally {
      lifecycle.cleanup();
    }
  };
};
