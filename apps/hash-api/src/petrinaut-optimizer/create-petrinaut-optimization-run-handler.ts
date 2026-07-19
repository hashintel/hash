import {
  createPetrinautOptimizationRun,
  PetrinautOptimizerHttpError,
} from "@local/petrinaut-optimizer-client";

import { RESPONSE_START_TIMEOUT_MS } from "./shared/optimization-request-lifecycle";
import { validateOptimizationRequest } from "./shared/validate-optimization-request";

import type { OptimizationRunOwners } from "./shared/optimization-run-owners";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

/**
 * Create the authenticated endpoint that starts a detached optimization run.
 *
 * Unlike the legacy streaming route, the response carries no events: it
 * returns the run id immediately and the browser attaches to
 * `GET …/optimize/runs/:runId/events` — and re-attaches after a disconnect —
 * to consume them. The run's ownership is recorded so only its creator can
 * attach to or cancel it.
 */
export const createPetrinautOptimizationRunHandler = ({
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
  // Accounts with a create request currently in flight: the ownership entry
  // only exists once the optimizer has answered, so this closes the window in
  // which two concurrent creates from one account would both be admitted.
  const pendingAccountIds = new Set<string>();

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
    if (
      pendingAccountIds.has(userId) ||
      runOwners.hasLiveRunForAccount(userId)
    ) {
      requestLogger.warn("Petrinaut optimization run rejected: account busy", {
        userId,
      });
      response.status(429).json({
        error: "An optimization is already running for this account",
      });
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

    requestLogger.info("Petrinaut optimization run requested", {
      bodyBytes,
      requestedTrials: input.study.trials,
      userId,
    });

    pendingAccountIds.add(userId);
    // Creation is a single round-trip: bound it like the legacy handler
    // bounds its time to first upstream byte.
    const abortController = new AbortController();
    const deadline = { timedOut: false };
    const createTimeout = setTimeout(() => {
      deadline.timedOut = true;
      abortController.abort();
    }, RESPONSE_START_TIMEOUT_MS);

    try {
      const { runId } = await createPetrinautOptimizationRun({
        endpoint: origin,
        fetchImpl,
        input,
        ...(requestId ? { requestId } : {}),
        signal: abortController.signal,
      });
      runOwners.register(runId, {
        accountId: userId,
        requestedTrials: input.study.trials,
      });
      requestLogger.info("Petrinaut optimization run created", {
        durationMs: Date.now() - startedAt,
        optimizationRunId: runId,
        userId,
      });
      response.status(201);
      response.set({ "X-Optimization-Run-ID": runId });
      response.json({ runId });
    } catch (error) {
      const optimizationRunId =
        error instanceof PetrinautOptimizerHttpError
          ? error.optimizationRunId
          : null;
      requestLogger.warn("Petrinaut optimization run creation failed", {
        durationMs: Date.now() - startedAt,
        error,
        optimizationRunId,
        outcome: deadline.timedOut ? "timeout" : "upstream-error",
        userId,
      });
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
        response.status(deadline.timedOut ? 504 : 502).json({
          error: deadline.timedOut
            ? "Petrinaut optimization timed out"
            : "Petrinaut optimization failed",
        });
      }
    } finally {
      clearTimeout(createTimeout);
      pendingAccountIds.delete(userId);
    }
  };
};
