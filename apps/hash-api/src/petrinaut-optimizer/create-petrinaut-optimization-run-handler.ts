import { RESPONSE_START_TIMEOUT_MS } from "./shared/optimization-request-lifecycle";
import {
  resolveOptimizationRouteContext,
  respondUpstreamFailure,
} from "./shared/optimization-route-context";
import { validateOptimizationRequest } from "./shared/validate-optimization-request";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerClient } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

/**
 * Create the authenticated endpoint that starts a detached optimization run.
 *
 * NodeAPI only authenticates, rate-limits, and validates: the manifest is
 * forwarded with the account's tag (`x-hash-account-id`), and the optimizer
 * itself owns run state — per-account single-flight at admission, and
 * owner-only visibility on attach/cancel. The response carries no events:
 * the browser attaches to `GET …/optimize/runs/:runId/events` (and
 * re-attaches after a disconnect) to consume them.
 */
export const createPetrinautOptimizationRunHandler = ({
  client,
  logger,
  origin,
}: {
  client: PetrinautOptimizerClient;
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

    // Creation is a single round-trip: bound its time to the upstream
    // answer. The controller also fires when the HASH client disconnects
    // while the round-trip is still in flight.
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
      const created = await client.POST("/optimize/runs", {
        body: input,
        headers: {
          "x-hash-account-id": userId,
          ...(requestId ? { "x-hash-request-id": requestId } : {}),
        },
        signal: abortController.signal,
      });
      const runId = created.data?.run_id;
      if (!created.response.ok || !runId) {
        const durationMs = Date.now() - startedAt;
        const upstreamRunId = created.response.headers.get(
          "x-optimization-run-id",
        );
        requestLogger.warn("Petrinaut optimization run creation failed", {
          durationMs,
          optimizationRunId: upstreamRunId,
          outcome: "upstream-error",
          upstreamStatus: created.response.status,
          userId,
        });
        if (upstreamRunId !== null) {
          response.set({ "X-Optimization-Run-ID": upstreamRunId });
        }
        if (created.response.status === 429) {
          const retryAfter = created.response.headers.get("retry-after");
          if (retryAfter) {
            response.set({ "Retry-After": retryAfter });
          }
          // The optimizer's detail is server-authored and distinguishes
          // "your account already runs one" from "the service is at
          // capacity", so it is forwarded rather than flattened.
          response.status(429).json({
            error:
              typeof created.error?.detail === "string"
                ? created.error.detail
                : "Petrinaut optimizer is busy",
          });
        } else {
          respondUpstreamFailure(response, false);
        }
        return;
      }

      if (outcome.clientDisconnected || response.destroyed) {
        // The run was admitted upstream but nobody will ever learn its id.
        // Cancel it best-effort so the account is not blocked for the rest
        // of the orphan grace period; the optimizer's reaper is the backstop.
        const cancelled = await client
          .DELETE("/optimize/runs/{run_id}", {
            params: { path: { run_id: runId } },
            headers: {
              "x-hash-account-id": userId,
              ...(requestId ? { "x-hash-request-id": requestId } : {}),
            },
            signal: AbortSignal.timeout(RESPONSE_START_TIMEOUT_MS),
          })
          .catch((error: unknown) => {
            requestLogger.warn(
              "Could not cancel abandoned Petrinaut optimization run",
              { error, optimizationRunId: runId, userId },
            );
            return null;
          });
        if (cancelled && !cancelled.response.ok) {
          requestLogger.warn(
            "Could not cancel abandoned Petrinaut optimization run",
            {
              optimizationRunId: runId,
              upstreamStatus: cancelled.response.status,
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
      requestLogger.warn("Petrinaut optimization run creation failed", {
        durationMs,
        error,
        outcome: outcome.timedOut ? "timeout" : "upstream-error",
        userId,
      });
      respondUpstreamFailure(response, outcome.timedOut);
    } finally {
      clearTimeout(createTimeout);
      request.off("aborted", abortForClientDisconnect);
      response.off("close", abortForClientDisconnect);
    }
  };
};
