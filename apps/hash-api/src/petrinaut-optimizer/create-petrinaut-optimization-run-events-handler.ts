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
  resolveOptimizationRouteContext,
  respondUpstreamFailure,
  RUN_NOT_FOUND,
} from "./shared/optimization-route-context";
import {
  capPathSegment,
  MAX_EVENT_BYTES,
} from "./shared/validate-optimization-request";

import type { PetrinautOptimizationEvent } from "@hashintel/petrinaut-core";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

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
 * The optimizer enforces ownership from the forwarded account tag: unknown
 * run ids — including runs another account owns — answer 404 without
 * revealing whether they exist.
 */
export const createPetrinautOptimizationRunEventsHandler = ({
  fetchImpl,
  logger,
  origin,
}: {
  fetchImpl: PetrinautOptimizerFetch;
  logger: Pick<Logger, "child" | "info" | "warn">;
  origin: URL | null;
}): RequestHandler => {
  return async (request, response) => {
    const context = resolveOptimizationRouteContext(request, response, {
      logger,
      origin,
    });
    if (!context) {
      return;
    }
    const { requestId, requestLogger, startedAt, userId } = context;

    const runId = request.params.runId ?? "";
    const cursor = parseCursor(request.query.cursor);
    if (cursor === undefined) {
      requestLogger.warn("Petrinaut optimization run attach rejected", {
        // The run id is user-controlled; the optimizer owns the check.
        optimizationRunId: capPathSegment(runId),
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
        endpoint: context.origin,
        runId,
        cursor,
        fetchImpl,
        // The optimizer enforces that this account owns the run; it also
        // reports the manifest's requested trial count on the response so
        // the synthesized summary is sized without NodeAPI remembering the
        // manifest. No direction is passed, so `best` stays null (the
        // browser keeps its own running best across reconnections).
        headers: { "x-hash-account-id": userId },
        maxEventBytes: MAX_EVENT_BYTES,
        onActivity: lifecycle.resetIdleTimeout,
        ...(requestId ? { requestId } : {}),
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
      requestLogger.info("Petrinaut optimization run attachment finished", {
        durationMs: Date.now() - startedAt,
        optimizationRunId: runId,
        outcome: "completed",
        userId,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
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
          respondUpstreamFailure(
            response,
            Boolean(lifecycle.state.timeoutKind),
          );
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
