import { cancelPetrinautOptimizationRun } from "@local/petrinaut-optimizer-client";

import { RESPONSE_START_TIMEOUT_MS } from "./shared/optimization-request-lifecycle";
import { capPathSegment } from "./shared/validate-optimization-request";

import type { OptimizationRunOwners } from "./shared/optimization-run-owners";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

const RUN_NOT_FOUND = { error: "Optimization run not found" } as const;

/**
 * Create the authenticated endpoint that cancels a detached optimization run.
 *
 * Only the run's creator may cancel it; unknown run ids — including runs
 * another account owns — answer 404 without revealing whether they exist.
 * Cancellation is idempotent: a run the optimizer already finished, reaped,
 * or expired still answers 204, and the ownership entry is released either
 * way so the account can start its next run immediately.
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

    const owner = runOwners.get(runId);
    if (!owner || owner.accountId !== userId) {
      // 404 rather than 403: revealing that a run id exists but belongs to
      // someone else would leak information to id-guessing clients.
      requestLogger.warn("Petrinaut optimization run cancel rejected", {
        // The run id is user-controlled until the ownership check passes.
        optimizationRunId: capPathSegment(runId),
        reason: owner ? "not-owner" : "unknown-run",
        userId,
      });
      response.status(404).json(RUN_NOT_FOUND);
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
        endpoint: origin,
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
      response.status(deadline.timedOut ? 504 : 502).json({
        error: deadline.timedOut
          ? "Petrinaut optimization timed out"
          : "Petrinaut optimization failed",
      });
    } finally {
      clearTimeout(cancelTimeout);
    }
  };
};
