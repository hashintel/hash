import { createPetrinautOptimizationHandler } from "./create-petrinaut-optimization-handler";

import type { components } from "@local/petrinaut-optimizer-client";
import type { Express } from "express";

export const PETRINAUT_OPTIMIZER_STATUS_PATH =
  "/api/petrinaut-optimizer/status";
export const PETRINAUT_OPTIMIZER_CAPABILITIES_PATH =
  "/api/petrinaut-optimizer/capabilities";
export const PETRINAUT_OPTIMIZER_OPTIMIZE_PATH =
  "/api/petrinaut-optimizer/optimize";

const STATUS_REQUEST_TIMEOUT_MS = 5_000;

type PetrinautOptimizerStatus = components["schemas"]["RunStatus"];

const PETRINAUT_OPTIMIZER_PHASES = [
  "idle",
  "running",
  "done",
  "error",
] as const satisfies readonly NonNullable<PetrinautOptimizerStatus["phase"]>[];

/** Return whether an unknown value is a supported optimizer phase. */
const isPetrinautOptimizerPhase = (
  value: unknown,
): value is NonNullable<PetrinautOptimizerStatus["phase"]> =>
  typeof value === "string" &&
  PETRINAUT_OPTIMIZER_PHASES.some((phase) => phase === value);

/** Validate one runtime status payload returned by Petrinaut Optimizer. */
const isPetrinautOptimizerStatus = (
  value: unknown,
): value is PetrinautOptimizerStatus => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const {
    detail,
    phase,
    run_id: runId,
    updated_at: updatedAt,
  } = value as Record<string, unknown>;

  return (
    typeof runId === "string" &&
    runId.length > 0 &&
    isPetrinautOptimizerPhase(phase) &&
    (detail === undefined || detail === null || typeof detail === "string") &&
    (updatedAt === undefined ||
      updatedAt === null ||
      typeof updatedAt === "string")
  );
};

/** Validate the complete status list returned by Petrinaut Optimizer. */
const isPetrinautOptimizerStatusList = (
  value: unknown,
): value is PetrinautOptimizerStatus[] =>
  Array.isArray(value) && value.every(isPetrinautOptimizerStatus);

/** Remove run-specific details and select the process-level current status. */
const summarizePetrinautOptimizerStatus = (
  statuses: readonly PetrinautOptimizerStatus[],
) => {
  const current =
    statuses.findLast((status) => status.phase === "running") ??
    statuses.at(-1);
  return {
    phase: current?.phase ?? "idle",
    detail: null,
    updated_at: current?.updated_at ?? null,
  };
};

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type WarningLogger = {
  /** Record a recoverable integration failure and its diagnostic metadata. */
  warn: (message: string, metadata?: Record<string, unknown>) => void;
};

type PetrinautOptimizerHandlerOptions = {
  origin: URL | null;
  fetchImpl?: Fetch;
  logger: WarningLogger;
};

/** Resolve the private optimizer origin from the environment. */
export const getPetrinautOptimizerOrigin = (
  environment: NodeJS.ProcessEnv = process.env,
): URL | null => {
  const host = environment.HASH_PETRINAUT_OPT_HOST;
  const portValue = environment.HASH_PETRINAUT_OPT_PORT;

  if (!host && !portValue) {
    return null;
  }
  if (!host || !portValue) {
    throw new Error(
      "HASH_PETRINAUT_OPT_HOST and HASH_PETRINAUT_OPT_PORT must be set together",
    );
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      "HASH_PETRINAUT_OPT_PORT must be an integer from 1 to 65535",
    );
  }

  const urlHost =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return new URL(`http://${urlHost}:${port}`);
};

/** Mount authenticated NodeAPI routes for Petrinaut optimization. */
export const setupPetrinautOptimizerHandler = (
  app: Express,
  { origin, fetchImpl = fetch, logger }: PetrinautOptimizerHandlerOptions,
) => {
  /**
   * Report whether this deployment has Petrinaut Optimizer configured.
   *
   * This is intentionally configuration-only rather than a healthcheck: the
   * frontend should keep the feature visible during a transient service outage
   * and report that outage when the user tries to start an optimization.
   */
  app.get(PETRINAUT_OPTIMIZER_CAPABILITIES_PATH, async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    res.json({ optimization: origin !== null });
  });

  /**
   * Return a sanitized process-level status for Petrinaut Optimizer.
   *
   * Upstream run identifiers and details are deliberately removed because a
   * shared optimizer instance may contain runs belonging to other HASH users.
   */
  app.get(PETRINAUT_OPTIMIZER_STATUS_PATH, async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!origin) {
      res.status(503).json({ error: "Petrinaut optimizer is not configured" });
      return;
    }

    try {
      const upstreamResponse = await fetchImpl(new URL("/status", origin), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(STATUS_REQUEST_TIMEOUT_MS),
      });

      if (!upstreamResponse.ok) {
        throw new Error(
          `Petrinaut optimizer returned status ${upstreamResponse.status}`,
        );
      }

      const status: unknown = await upstreamResponse.json();
      if (!isPetrinautOptimizerStatusList(status)) {
        throw new Error(
          "Petrinaut optimizer returned an invalid status payload",
        );
      }
      // Run IDs and details are service-internal and may belong to another
      // authenticated HASH user. Expose only a process-level health summary.
      res.json(summarizePetrinautOptimizerStatus(status));
    } catch (error) {
      logger.warn("Could not reach Petrinaut optimizer", { error });
      res.status(503).json({ error: "Petrinaut optimizer is unavailable" });
    }
  });

  /**
   * Validate and proxy one authenticated optimization request.
   *
   * The route enforces request and concurrency limits, owns cancellation and
   * execution deadlines, and converts the shared client's canonical events to
   * the NDJSON protocol consumed by the HASH frontend.
   */
  app.post(
    PETRINAUT_OPTIMIZER_OPTIMIZE_PATH,
    createPetrinautOptimizationHandler({ fetchImpl, logger, origin }),
  );
};
