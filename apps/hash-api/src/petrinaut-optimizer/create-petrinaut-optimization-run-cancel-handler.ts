import { cancelPetrinautOptimizationRun } from "@local/petrinaut-optimizer-client";

import { RESPONSE_START_TIMEOUT_MS } from "./shared/optimization-request-lifecycle";
import {
  requireOwnedRun,
  resolveOptimizationRouteContext,
  respondUpstreamFailure,
} from "./shared/optimization-route-context";

import type { OptimizationRunOwners } from "./shared/optimization-run-owners";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

/**
 * Create the authenticated endpoint that cancels a detached optimization run.
 *
 * Only the run's creator may cancel it. Cancellation is idempotent: a run
 * the optimizer already finished, reaped, or expired still answers 204, and
 * the ownership entry is released either way so the account can start its
 * next run immediately.
 */
export const createPetrinautOptimizationRunCancelHandler = ({
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
    const context = resolveOptimizationRouteContext(request, response, {
      logger,
      origin,
    });
    if (!context) {
      return;
    }
    const { requestId, requestLogger, startedAt, userId } = context;

    const runId = request.params.runId ?? "";
    if (
      !requireOwnedRun(response, {
        action: "cancel",
        requestLogger,
        runId,
        runOwners,
        userId,
      })
    ) {
      return;
    }

    const abortController = new AbortController();
    const deadline = { timedOut: false };
    const cancelTimeout = setTimeout(() => {
      deadline.timedOut = true;
      abortController.abort();
    }, RESPONSE_START_TIMEOUT_MS);

    try {
      await cancelPetrinautOptimizationRun({
        endpoint: context.origin,
        runId,
        fetchImpl,
        ...(requestId ? { requestId } : {}),
        signal: abortController.signal,
      });
      runOwners.release(runId);
      requestLogger.info("Petrinaut optimization run cancelled", {
        durationMs: Date.now() - startedAt,
        optimizationRunId: runId,
        userId,
      });
      response.status(204).end();
    } catch (error) {
      // The ownership entry survives so the owner can retry the cancel.
      requestLogger.warn("Petrinaut optimization run cancellation failed", {
        durationMs: Date.now() - startedAt,
        error,
        optimizationRunId: runId,
        outcome: deadline.timedOut ? "timeout" : "upstream-error",
        userId,
      });
      respondUpstreamFailure(response, deadline.timedOut);
    } finally {
      clearTimeout(cancelTimeout);
    }
  };
};
