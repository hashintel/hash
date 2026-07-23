import {
  cancelPetrinautOptimizationRun,
  createPetrinautOptimizationRun,
  getPetrinautOptimizationRunStatus,
  PetrinautOptimizerHttpError,
} from "@local/petrinaut-optimizer-client";

import { RESPONSE_START_TIMEOUT_MS } from "./shared/optimization-request-lifecycle";
import {
  resolveOptimizationRouteContext,
  respondUpstreamFailure,
} from "./shared/optimization-route-context";
import { validateOptimizationRequest } from "./shared/validate-optimization-request";

import type { OptimizationAccountOccupancy } from "./shared/optimization-account-occupancy";
import type { OptimizationRunOwners } from "./shared/optimization-run-owners";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

// One bounded status probe: long enough for a healthy optimizer to answer,
// short enough that a stalled one cannot pin the create request.
const OWNED_RUN_LIVENESS_TIMEOUT_MS = 5_000;

/**
 * Decide whether an account's owned run is provably gone upstream.
 *
 * A browser that loses its run id (e.g. a page reload) has no way to cancel
 * the run, and once the optimizer reaps it NodeAPI's ownership entry would
 * otherwise 429-lock the account until the inactivity TTL. Probing the
 * optimizer's status API resolves that staleness at the next create attempt:
 * a terminal phase (`done`, `error`, or `idle` — the cancelled/reaped state)
 * or an unknown run releases the entry. A probe failure keeps the account
 * locked (fail closed): an unreachable optimizer proves nothing.
 */
const checkOwnedRunGone = async ({
  fetchImpl,
  origin,
  requestId,
  runId,
}: {
  fetchImpl: PetrinautOptimizerFetch;
  origin: URL;
  requestId: string;
  runId: string;
}): Promise<"terminal-phase" | "unknown-run" | null> => {
  try {
    const status = await getPetrinautOptimizationRunStatus({
      endpoint: origin,
      fetchImpl,
      ...(requestId ? { requestId } : {}),
      runId,
      signal: AbortSignal.timeout(OWNED_RUN_LIVENESS_TIMEOUT_MS),
    });
    return status.phase === "running" ? null : "terminal-phase";
  } catch (error) {
    if (error instanceof PetrinautOptimizerHttpError && error.status === 404) {
      return "unknown-run";
    }
    return null;
  }
};

/**
 * Create the authenticated endpoint that starts a detached optimization run.
 *
 * The response carries no events: it returns the run id immediately and the
 * browser attaches to `GET …/optimize/runs/:runId/events` — and re-attaches
 * after a disconnect — to consume them. The run's ownership is recorded so
 * only its creator can attach to or cancel it, and admission enforces the
 * per-account single-flight rule.
 */
export const createPetrinautOptimizationRunHandler = ({
  fetchImpl,
  logger,
  occupancy,
  origin,
  runOwners,
}: {
  fetchImpl: PetrinautOptimizerFetch;
  logger: Pick<Logger, "child" | "info" | "warn">;
  /** Per-account single-flight state for in-flight creates. */
  occupancy: OptimizationAccountOccupancy;
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

    // Another in-flight create can never be stale, so it rejects
    // immediately; run ownership is re-checked below where a liveness probe
    // can prove a remembered run gone.
    if (occupancy.isAccountActive(userId)) {
      requestLogger.warn("Petrinaut optimization run rejected: account busy", {
        userId,
      });
      response.status(429).json({
        error: "An optimization is already running for this account",
      });
      return;
    }

    // Marked before the ownership probe so a concurrent create from the same
    // account cannot slip through while this one awaits the optimizer; the
    // ownership entry itself only exists once the optimizer has answered.
    occupancy.beginPendingRun(userId);
    // Creation is a single round-trip: bound its time to the first upstream
    // byte. The controller also fires when the HASH client disconnects while
    // the round-trip is still in flight.
    const abortController = new AbortController();
    const outcome = { clientDisconnected: false, timedOut: false };
    const abortForClientDisconnect = () => {
      outcome.clientDisconnected = true;
      abortController.abort();
    };
    request.once("aborted", abortForClientDisconnect);
    response.once("close", abortForClientDisconnect);
    const createTimeout = setTimeout(() => {
      outcome.timedOut = true;
      abortController.abort();
    }, RESPONSE_START_TIMEOUT_MS);

    try {
      const ownedRun = runOwners.findLiveRunForAccount(userId);
      if (ownedRun) {
        const staleness = await checkOwnedRunGone({
          fetchImpl,
          origin: context.origin,
          requestId,
          runId: ownedRun.runId,
        });
        if (staleness === null) {
          requestLogger.warn(
            "Petrinaut optimization run rejected: account busy",
            { userId },
          );
          response.status(429).json({
            error: "An optimization is already running for this account",
          });
          return;
        }
        runOwners.release(ownedRun.runId);
        requestLogger.info(
          "Petrinaut optimization run ownership released: stale",
          {
            optimizationRunId: ownedRun.runId,
            reason: staleness,
            userId,
          },
        );
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

      const { runId } = await createPetrinautOptimizationRun({
        endpoint: context.origin,
        fetchImpl,
        input,
        ...(requestId ? { requestId } : {}),
        signal: abortController.signal,
      });
      if (outcome.clientDisconnected || response.destroyed) {
        // The run was admitted upstream but nobody will ever learn its id.
        // Cancel it best-effort and record no ownership, so the account is
        // not blocked by a run no client knows about.
        try {
          await cancelPetrinautOptimizationRun({
            endpoint: context.origin,
            fetchImpl,
            ...(requestId ? { requestId } : {}),
            runId,
            signal: AbortSignal.timeout(RESPONSE_START_TIMEOUT_MS),
          });
        } catch (cancelError) {
          // The optimizer's detach-grace reaper remains the backstop.
          requestLogger.warn(
            "Could not cancel abandoned Petrinaut optimization run",
            {
              error: cancelError,
              optimizationRunId: runId,
              userId,
            },
          );
        }
        requestLogger.info("Petrinaut optimization run creation finished", {
          durationMs: Date.now() - startedAt,
          optimizationRunId: runId,
          outcome: "client-disconnected",
          userId,
        });
        return;
      }
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
      const durationMs = Date.now() - startedAt;
      if (outcome.clientDisconnected || response.destroyed) {
        requestLogger.info("Petrinaut optimization run creation finished", {
          durationMs,
          outcome: "client-disconnected",
          userId,
        });
        return;
      }
      const optimizationRunId =
        error instanceof PetrinautOptimizerHttpError
          ? error.optimizationRunId
          : null;
      requestLogger.warn("Petrinaut optimization run creation failed", {
        durationMs,
        error,
        optimizationRunId,
        outcome: outcome.timedOut ? "timeout" : "upstream-error",
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
        respondUpstreamFailure(response, outcome.timedOut);
      }
    } finally {
      clearTimeout(createTimeout);
      request.off("aborted", abortForClientDisconnect);
      response.off("close", abortForClientDisconnect);
      occupancy.endPendingRun(userId);
    }
  };
};
