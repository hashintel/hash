import { capPathSegment } from "./validate-optimization-request";

import type {
  OptimizationRunOwner,
  OptimizationRunOwners,
} from "./optimization-run-owners";
import type { Logger } from "@local/hash-backend-utils/logger";
import type { Request, Response } from "express";

export const RUN_NOT_FOUND = { error: "Optimization run not found" } as const;

/** Per-request logger correlated with the `x-hash-request-id` header. */
export type OptimizationRequestLogger = Pick<Logger, "info" | "warn">;

export type OptimizationRouteContext = {
  /** The configured optimizer origin (the 503 precondition has passed). */
  origin: URL;
  requestId: string;
  requestLogger: OptimizationRequestLogger;
  startedAt: number;
  userId: string;
};

/**
 * Resolve the preamble shared by every optimization route: the correlated
 * request logger, the authenticated account, and the configured upstream
 * origin. Writes the 401/503 response and returns `null` when a
 * precondition fails, so callers can simply bail out.
 */
export const resolveOptimizationRouteContext = (
  request: Request,
  response: Response,
  {
    logger,
    origin,
  }: {
    logger: Pick<Logger, "child" | "info" | "warn">;
    origin: URL | null;
  },
): OptimizationRouteContext | null => {
  const startedAt = Date.now();
  const requestId = response.get("x-hash-request-id") ?? "";
  const requestLogger = logger.child({ requestId });

  if (!request.user) {
    response.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (!origin) {
    response
      .status(503)
      .json({ error: "Petrinaut optimizer is not configured" });
    return null;
  }

  return {
    origin,
    requestId,
    requestLogger,
    startedAt,
    userId: request.user.accountId,
  };
};

/**
 * Enforce that `runId` names a run owned by the calling account, answering
 * 404 (and returning `null`) otherwise. 404 rather than 403 on purpose:
 * revealing that a run id exists but belongs to someone else would leak
 * information to id-guessing clients.
 */
export const requireOwnedRun = (
  response: Response,
  {
    action,
    requestLogger,
    runId,
    runOwners,
    userId,
  }: {
    /** Names the rejected verb in the log line, e.g. "attach" or "cancel". */
    action: string;
    requestLogger: OptimizationRequestLogger;
    runId: string;
    runOwners: OptimizationRunOwners;
    userId: string;
  },
): OptimizationRunOwner | null => {
  const owner = runOwners.get(runId);
  if (!owner || owner.accountId !== userId) {
    requestLogger.warn(`Petrinaut optimization run ${action} rejected`, {
      // The run id is user-controlled until the ownership check passes.
      optimizationRunId: capPathSegment(runId),
      reason: owner ? "not-owner" : "unknown-run",
      userId,
    });
    response.status(404).json(RUN_NOT_FOUND);
    return null;
  }
  return owner;
};

/** Answer a failed upstream round-trip: 504 for our own deadline, 502 else. */
export const respondUpstreamFailure = (
  response: Response,
  timedOut: boolean,
): void => {
  response.status(timedOut ? 504 : 502).json({
    error: timedOut
      ? "Petrinaut optimization timed out"
      : "Petrinaut optimization failed",
  });
};
