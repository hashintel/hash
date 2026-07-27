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
