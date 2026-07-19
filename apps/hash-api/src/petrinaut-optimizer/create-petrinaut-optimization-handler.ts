import {
  openPetrinautOptimizationStream,
  PetrinautOptimizerHttpError,
} from "@local/petrinaut-optimizer-client";

import {
  forwardOptimizationEvents,
  writeTerminalOptimizationEventBestEffort,
} from "./shared/forward-optimization-events";
import { createOptimizationRequestLifecycle } from "./shared/optimization-request-lifecycle";
import {
  MAX_EVENT_BYTES,
  validateOptimizationRequest,
} from "./shared/validate-optimization-request";

import type { PetrinautOptimizationEvent } from "@hashintel/petrinaut-core";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

const MAX_CONCURRENT_OPTIMIZATIONS = 4;

/** Create the authenticated endpoint that proxies optimization studies. */
export const createPetrinautOptimizationHandler = ({
  fetchImpl,
  logger,
  origin,
}: {
  fetchImpl: PetrinautOptimizerFetch;
  logger: Pick<Logger, "child" | "info" | "warn">;
  origin: URL | null;
}): RequestHandler => {
  let activeOptimizationCount = 0;
  const activeUserIds = new Set<string>();

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
    if (activeUserIds.has(userId)) {
      requestLogger.warn("Petrinaut optimization rejected: account busy", {
        activeOptimizationCount,
        userId,
      });
      response.status(429).json({
        error: "An optimization is already running for this account",
      });
      return;
    }
    if (activeOptimizationCount >= MAX_CONCURRENT_OPTIMIZATIONS) {
      requestLogger.warn("Petrinaut optimization rejected: at capacity", {
        activeOptimizationCount,
        maxConcurrentOptimizations: MAX_CONCURRENT_OPTIMIZATIONS,
        userId,
      });
      response.status(429).json({ error: "Petrinaut optimizer is busy" });
      return;
    }

    const validation = validateOptimizationRequest({
      body: request.body,
      requestLogger,
      userId,
    });
    if (!validation.ok) {
      response.status(validation.status).json(validation.body);
      return;
    }
    const { bodyBytes, input } = validation;

    requestLogger.info("Petrinaut optimization request accepted", {
      bodyBytes,
      requestedTrials: input.study.trials,
      userId,
    });

    activeOptimizationCount += 1;
    activeUserIds.add(userId);
    const lifecycle = createOptimizationRequestLifecycle(request, response);
    let optimizationRunId: string | null = null;

    try {
      const upstream = await openPetrinautOptimizationStream({
        endpoint: new URL("/optimize/all", origin),
        fetchImpl,
        input,
        maxEventBytes: MAX_EVENT_BYTES,
        onActivity: lifecycle.resetIdleTimeout,
        ...(requestId ? { requestId } : {}),
        signal: lifecycle.signal,
      });
      optimizationRunId = upstream.optimizationRunId;
      requestLogger.info("Petrinaut optimization stream opened", {
        optimizationRunId,
        userId,
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
      await forwardOptimizationEvents(
        upstream.events,
        response,
        lifecycle.markTerminalEvent,
        lifecycle.signal,
      );
      response.end();
      requestLogger.info("Petrinaut optimization finished", {
        durationMs: Date.now() - startedAt,
        optimizationRunId,
        outcome: "completed",
        userId,
      });
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
      if (lifecycle.state.clientDisconnected || response.destroyed) {
        requestLogger.info("Petrinaut optimization finished", {
          durationMs,
          optimizationRunId,
          outcome: "client-disconnected",
          userId,
        });
        return;
      }
      requestLogger.warn("Petrinaut optimization failed", {
        durationMs,
        error,
        optimizationRunId,
        outcome: lifecycle.state.timeoutKind
          ? `timeout:${lifecycle.state.timeoutKind}`
          : "upstream-error",
        timeoutKind: lifecycle.state.timeoutKind,
        userId,
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
      if (!lifecycle.state.terminalEventSent) {
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
          requestLogger.warn(
            "Could not report Petrinaut optimization failure",
            {
              error: writeError,
              optimizationRunId,
            },
          );
        }
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
