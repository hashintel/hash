import { RESPONSE_START_TIMEOUT_MS } from "./shared/optimization-request-lifecycle";
import {
  resolveOptimizationRouteContext,
  respondUpstreamFailure,
  RUN_NOT_FOUND,
} from "./shared/optimization-route-context";
import { capPathSegment } from "./shared/validate-optimization-request";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerClient } from "@local/petrinaut-optimizer-client";
import type { RequestHandler } from "express";

/**
 * Create the authenticated endpoint that cancels a detached optimization run.
 *
 * The optimizer enforces ownership: the account tag is forwarded and a
 * foreign or unknown run answers 404 (never 403, so run ids cannot be
 * probed). Cancellation is idempotent upstream — a run that already
 * finished, was reaped, or expired still answers 204 while it is retained.
 */
export const createPetrinautOptimizationRunCancelHandler = ({
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
    const runId = request.params.runId ?? "";
    // The run id is user-controlled; the optimizer decides whether it names
    // a run this account owns.
    const loggedRunId = capPathSegment(runId);

    const deadline = { timedOut: false };
    const cancelTimeout = AbortSignal.timeout(RESPONSE_START_TIMEOUT_MS);
    cancelTimeout.addEventListener("abort", () => {
      deadline.timedOut = true;
    });

    try {
      const cancelled = await client.DELETE("/optimize/runs/{run_id}", {
        params: { path: { run_id: runId } },
        headers: {
          "x-hash-account-id": userId,
          ...(requestId ? { "x-hash-request-id": requestId } : {}),
        },
        signal: cancelTimeout,
      });
      if (cancelled.response.status === 404) {
        requestLogger.warn("Petrinaut optimization run cancel rejected", {
          optimizationRunId: loggedRunId,
          reason: "unknown-or-foreign-run",
          userId,
        });
        response.status(404).json(RUN_NOT_FOUND);
        return;
      }
      if (!cancelled.response.ok) {
        requestLogger.warn("Petrinaut optimization run cancellation failed", {
          durationMs: Date.now() - startedAt,
          optimizationRunId: loggedRunId,
          outcome: "upstream-error",
          upstreamStatus: cancelled.response.status,
          userId,
        });
        respondUpstreamFailure(response, false);
        return;
      }
      requestLogger.info("Petrinaut optimization run cancelled", {
        durationMs: Date.now() - startedAt,
        optimizationRunId: runId,
        userId,
      });
      response.status(204).end();
    } catch (error) {
      requestLogger.warn("Petrinaut optimization run cancellation failed", {
        durationMs: Date.now() - startedAt,
        error,
        optimizationRunId: loggedRunId,
        outcome: deadline.timedOut ? "timeout" : "upstream-error",
        userId,
      });
      respondUpstreamFailure(response, deadline.timedOut);
    }
  };
};
