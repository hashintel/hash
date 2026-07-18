import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { createPetrinautOptimizationHandler } from "./create-petrinaut-optimization-handler";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { Express } from "express";

export const PETRINAUT_OPTIMIZER_CAPABILITIES_PATH =
  "/api/petrinaut-optimizer/capabilities";
export const PETRINAUT_OPTIMIZER_OPTIMIZE_PATH =
  "/api/petrinaut-optimizer/optimize";

type PetrinautOptimizerHandlerOptions = {
  origin: URL | null;
  fetchImpl?: PetrinautOptimizerFetch;
  logger: Pick<Logger, "warn">;
};

/** Bound expensive optimization attempts per authenticated account or IP. */
const optimizationRateLimiter = rateLimit({
  windowMs: process.env.NODE_ENV === "test" ? 10 : 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) =>
    request.user?.accountId ??
    (request.ip ? ipKeyGenerator(request.ip) : "ip-unavailable"),
  message: { error: "Too many optimization requests" },
});

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
  app.get(PETRINAUT_OPTIMIZER_CAPABILITIES_PATH, (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    res.json({ optimization: origin !== null });
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
    optimizationRateLimiter,
    createPetrinautOptimizationHandler({ fetchImpl, logger, origin }),
  );
};
