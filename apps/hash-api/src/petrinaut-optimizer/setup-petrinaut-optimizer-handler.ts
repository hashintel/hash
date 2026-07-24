import { ipKeyGenerator, rateLimit } from "express-rate-limit";

import { createPetrinautOptimizerClient } from "@local/petrinaut-optimizer-client";

import { createPetrinautOptimizationRunCancelHandler } from "./create-petrinaut-optimization-run-cancel-handler";
import { createPetrinautOptimizationRunEventsHandler } from "./create-petrinaut-optimization-run-events-handler";
import { createPetrinautOptimizationRunHandler } from "./create-petrinaut-optimization-run-handler";

import type { Logger } from "@local/hash-backend-utils/logger";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";
import type { Express, Request } from "express";

export const PETRINAUT_OPTIMIZER_CAPABILITIES_PATH =
  "/api/petrinaut-optimizer/capabilities";
export const PETRINAUT_OPTIMIZER_OPTIMIZE_RUNS_PATH =
  "/api/petrinaut-optimizer/optimize/runs";
export const PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_PATH =
  "/api/petrinaut-optimizer/optimize/runs/:runId";
export const PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_EVENTS_PATH =
  "/api/petrinaut-optimizer/optimize/runs/:runId/events";

type PetrinautOptimizerHandlerOptions = {
  origin: URL | null;
  fetchImpl?: PetrinautOptimizerFetch;
  logger: Pick<Logger, "child" | "info" | "warn">;
};

const rateLimitKeyGenerator = (request: Request) =>
  request.user?.accountId ??
  (request.ip ? ipKeyGenerator(request.ip) : "ip-unavailable");

/** Bound expensive optimization attempts per authenticated account or IP. */
const optimizationRateLimiter = rateLimit({
  windowMs: process.env.NODE_ENV === "test" ? 10 : 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  message: { error: "Too many optimization requests" },
});

/**
 * Attaching does no expensive upstream work, and the auto-reconnect loop may
 * legitimately re-attach many times behind a flaky connection — a shared
 * bucket with creation would 429 an account off the event stream of its own
 * live run.
 */
const attachmentRateLimiter = rateLimit({
  windowMs: process.env.NODE_ENV === "test" ? 10 : 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
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

/**
 * Mount authenticated NodeAPI routes for Petrinaut optimization.
 *
 * NodeAPI is a thin, stateless proxy: it authenticates, rate-limits, and
 * validates, then forwards to the optimizer with the account's tag
 * (`x-hash-account-id`). The optimizer owns all run state — per-account
 * single-flight at admission, and owner-only visibility on attach/cancel.
 *
 * `POST …/optimize/runs` returns a run id immediately; events are consumed
 * (and resumed via `?cursor=`) through `GET …/optimize/runs/:runId/events`
 * attachments that never affect the run; `DELETE …/optimize/runs/:runId`
 * cancels explicitly.
 */
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

  // A dummy base keeps the client constructible when the optimizer is not
  // configured; the handlers answer 503 before ever using it then.
  const client = createPetrinautOptimizerClient(
    origin ?? "http://petrinaut-optimizer.invalid",
    fetchImpl,
  );

  app.post(
    PETRINAUT_OPTIMIZER_OPTIMIZE_RUNS_PATH,
    optimizationRateLimiter,
    createPetrinautOptimizationRunHandler({ client, logger, origin }),
  );
  app.get(
    PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_EVENTS_PATH,
    attachmentRateLimiter,
    createPetrinautOptimizationRunEventsHandler({
      fetchImpl,
      logger,
      origin,
    }),
  );
  app.delete(
    PETRINAUT_OPTIMIZER_OPTIMIZE_RUN_PATH,
    optimizationRateLimiter,
    createPetrinautOptimizationRunCancelHandler({ client, logger, origin }),
  );
};
