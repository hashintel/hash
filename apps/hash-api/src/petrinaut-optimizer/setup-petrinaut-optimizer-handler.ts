import { once } from "node:events";

import {
  petrinautOptimizationErrorEventSchema,
  petrinautOptimizationInputSchema,
} from "@hashintel/petrinaut-core";
import { openPetrinautOptimizationStream } from "@local/petrinaut-optimizer-client";

import type { PetrinautOptimizationEvent } from "@hashintel/petrinaut-core";
import type { components } from "@local/petrinaut-optimizer-client";
import type { Express, Response as ExpressResponse } from "express";

export const PETRINAUT_OPTIMIZER_STATUS_PATH =
  "/api/petrinaut-optimizer/status";
export const PETRINAUT_OPTIMIZER_CAPABILITIES_PATH =
  "/api/petrinaut-optimizer/capabilities";
export const PETRINAUT_OPTIMIZER_OPTIMIZE_PATH =
  "/api/petrinaut-optimizer/optimize";

const STATUS_REQUEST_TIMEOUT_MS = 5_000;
const OPTIMIZATION_RESPONSE_START_TIMEOUT_MS = 30_000;
const OPTIMIZATION_IDLE_TIMEOUT_MS = 5 * 60_000;
const OPTIMIZATION_OVERALL_TIMEOUT_MS = 15 * 60_000;
const MAX_OPTIMIZATION_REQUEST_BYTES = 8 * 1024 * 1024;
// A trial repeats optimized parameter identifiers from the accepted manifest,
// so use the same bound rather than rejecting a valid large search space.
const MAX_OPTIMIZATION_EVENT_BYTES = MAX_OPTIMIZATION_REQUEST_BYTES;
const MAX_CONCURRENT_OPTIMIZATIONS = 4;

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

/** Write one canonical optimization event as NDJSON with backpressure. */
const writeOptimizationEvent = async (
  response: ExpressResponse,
  event: PetrinautOptimizationEvent,
): Promise<void> => {
  if (!response.write(`${JSON.stringify(event)}\n`)) {
    if (response.destroyed || response.writableEnded) {
      throw new Error("The optimization client disconnected");
    }
    await Promise.race([
      once(response, "drain"),
      once(response, "close").then(() => {
        throw new Error("The optimization client disconnected");
      }),
    ]);
  }
};

/** Forward canonical optimization events as NDJSON. */
const forwardPetrinautOptimizationEvents = async (
  events: AsyncIterable<PetrinautOptimizationEvent>,
  response: ExpressResponse,
  options: {
    onTerminalEvent?: () => void;
  } = {},
): Promise<void> => {
  for await (const event of events) {
    await writeOptimizationEvent(response, event);
    if (event.type === "complete" || event.type === "error") {
      options.onTerminalEvent?.();
    }
  }
};

/** Mount authenticated NodeAPI routes for Petrinaut optimization. */
export const setupPetrinautOptimizerHandler = (
  app: Express,
  { origin, fetchImpl = fetch, logger }: PetrinautOptimizerHandlerOptions,
) => {
  let activeOptimizationCount = 0;
  const activeUserIds = new Set<string>();

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
  app.post(PETRINAUT_OPTIMIZER_OPTIMIZE_PATH, async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!origin) {
      res.status(503).json({ error: "Petrinaut optimizer is not configured" });
      return;
    }

    let serializedBody: unknown;
    try {
      serializedBody = JSON.stringify(req.body);
    } catch {
      res.status(400).json({ error: "Invalid optimization request" });
      return;
    }
    if (typeof serializedBody !== "string") {
      res.status(400).json({ error: "Invalid optimization request" });
      return;
    }
    if (
      Buffer.byteLength(serializedBody, "utf8") > MAX_OPTIMIZATION_REQUEST_BYTES
    ) {
      res.status(413).json({ error: "Optimization request is too large" });
      return;
    }

    const input = petrinautOptimizationInputSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({
        error: "Invalid optimization request",
        issues: input.error.issues,
      });
      return;
    }
    const upstreamInput = input.data;

    const userId = req.user.accountId;
    if (
      activeOptimizationCount >= MAX_CONCURRENT_OPTIMIZATIONS ||
      activeUserIds.has(userId)
    ) {
      res.status(429).json({ error: "An optimization is already running" });
      return;
    }

    activeOptimizationCount += 1;
    activeUserIds.add(userId);
    const abortController = new AbortController();
    type OptimizationTimeoutKind = "response_start" | "idle" | "overall";
    const lifecycle: {
      clientDisconnected: boolean;
      terminalEventSent: boolean;
      timeoutKind: OptimizationTimeoutKind | null;
    } = {
      clientDisconnected: false,
      terminalEventSent: false,
      timeoutKind: null,
    };
    let idleTimeout: ReturnType<typeof setTimeout> | undefined;

    /** Abort the upstream request after the HASH client disconnects. */
    const abortForClientDisconnect = () => {
      lifecycle.clientDisconnected = true;
      abortController.abort();
    };
    /** Record a timeout category and abort the upstream request. */
    const abortForTimeout = (kind: OptimizationTimeoutKind) => {
      lifecycle.timeoutKind ??= kind;
      abortController.abort();
    };
    const responseStartTimeout = setTimeout(
      () => abortForTimeout("response_start"),
      OPTIMIZATION_RESPONSE_START_TIMEOUT_MS,
    );
    const overallTimeout = setTimeout(
      () => abortForTimeout("overall"),
      OPTIMIZATION_OVERALL_TIMEOUT_MS,
    );
    /** Restart the inactivity deadline after any upstream bytes arrive. */
    const resetIdleTimeout = () => {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(
        () => abortForTimeout("idle"),
        OPTIMIZATION_IDLE_TIMEOUT_MS,
      );
    };

    req.once("aborted", abortForClientDisconnect);
    res.once("close", abortForClientDisconnect);

    try {
      const upstreamEvents = await openPetrinautOptimizationStream({
        endpoint: new URL("/optimize/all", origin),
        fetchImpl,
        input: upstreamInput,
        maxEventBytes: MAX_OPTIMIZATION_EVENT_BYTES,
        onActivity: resetIdleTimeout,
        signal: abortController.signal,
      });
      clearTimeout(responseStartTimeout);
      resetIdleTimeout();

      res.status(200);
      res.set({
        "Cache-Control": "no-cache, no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      await forwardPetrinautOptimizationEvents(upstreamEvents, res, {
        onTerminalEvent: () => {
          lifecycle.terminalEventSent = true;
        },
      });
      res.end();
    } catch (error) {
      if (lifecycle.clientDisconnected || res.destroyed) {
        return;
      }
      logger.warn("Petrinaut optimization failed", {
        error,
        timeoutKind: lifecycle.timeoutKind,
      });
      if (!res.headersSent) {
        res.status(lifecycle.timeoutKind ? 504 : 502).json({
          error: lifecycle.timeoutKind
            ? "Petrinaut optimization timed out"
            : "Petrinaut optimization failed",
        });
        return;
      }
      if (!lifecycle.terminalEventSent) {
        try {
          await writeOptimizationEvent(
            res,
            petrinautOptimizationErrorEventSchema.parse({
              type: "error",
              code: lifecycle.timeoutKind
                ? "optimization_timeout"
                : "upstream_stream_error",
              message: lifecycle.timeoutKind
                ? "The optimization exceeded its execution time limit"
                : "The optimizer stream ended unexpectedly",
              retryable: true,
            }),
          );
        } catch (writeError) {
          logger.warn("Could not report Petrinaut optimization failure", {
            error: writeError,
          });
        }
      }
      if (!res.writableEnded) {
        res.end();
      }
    } finally {
      clearTimeout(responseStartTimeout);
      clearTimeout(idleTimeout);
      clearTimeout(overallTimeout);
      req.off("aborted", abortForClientDisconnect);
      res.off("close", abortForClientDisconnect);
      activeOptimizationCount -= 1;
      activeUserIds.delete(userId);
    }
  });
};
