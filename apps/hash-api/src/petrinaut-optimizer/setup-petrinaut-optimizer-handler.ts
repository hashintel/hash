import { once } from "node:events";

import {
  petrinautOptimizationErrorEventSchema,
  petrinautOptimizationEventSchema,
  petrinautOptimizationInputSchema,
} from "@hashintel/petrinaut-core";

import type {
  PetrinautOptimizationEvent,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";
import type { components } from "@local/petrinaut-optimizer-types";
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

const isPetrinautOptimizerPhase = (
  value: unknown,
): value is NonNullable<PetrinautOptimizerStatus["phase"]> =>
  typeof value === "string" &&
  PETRINAUT_OPTIMIZER_PHASES.some((phase) => phase === value);

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

const isPetrinautOptimizerStatusList = (
  value: unknown,
): value is PetrinautOptimizerStatus[] =>
  Array.isArray(value) && value.every(isPetrinautOptimizerStatus);

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

const writeOptimizationEvent = async (
  response: ExpressResponse,
  event: unknown,
): Promise<void> => {
  const parsed = petrinautOptimizationEventSchema.safeParse(event);
  if (!parsed.success) {
    throw new Error("Petrinaut optimizer returned an invalid event");
  }
  if (!response.write(`${JSON.stringify(parsed.data)}\n`)) {
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

type JsonRecord = Record<string, unknown>;

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseTrialParameters = (
  value: unknown,
): Record<string, number | boolean> => {
  if (!isJsonRecord(value)) {
    throw new Error("Petrinaut optimizer returned invalid trial parameters");
  }

  const parameters: Record<string, number | boolean> = {};
  for (const [identifier, parameterValue] of Object.entries(value)) {
    if (
      typeof parameterValue !== "boolean" &&
      (typeof parameterValue !== "number" || !Number.isFinite(parameterValue))
    ) {
      throw new Error("Petrinaut optimizer returned invalid trial parameters");
    }
    parameters[identifier] = parameterValue;
  }
  return parameters;
};

type UpstreamTrial = {
  step: number;
  parameters: Record<string, number | boolean>;
  objective: number | null;
  state: "complete" | "pruned" | "failed";
};

const parseUpstreamTrial = (value: unknown): UpstreamTrial => {
  if (!isJsonRecord(value)) {
    throw new Error("Petrinaut optimizer returned an invalid SSE event");
  }
  if (!Number.isInteger(value.step) || (value.step as number) < 0) {
    throw new Error("Petrinaut optimizer returned an invalid trial number");
  }
  if (typeof value.state !== "string") {
    throw new Error("Petrinaut optimizer returned an invalid trial state");
  }

  const state = value.state.toUpperCase();
  const normalizedState =
    state === "COMPLETE"
      ? "complete"
      : state === "PRUNED"
        ? "pruned"
        : state === "FAIL" || state === "FAILED"
          ? "failed"
          : null;
  if (!normalizedState) {
    throw new Error("Petrinaut optimizer returned an invalid trial state");
  }

  const objective =
    typeof value.metric === "number" && Number.isFinite(value.metric)
      ? value.metric
      : null;
  if (normalizedState === "complete" && objective === null) {
    throw new Error(
      "Petrinaut optimizer returned a completed trial without an objective",
    );
  }

  return {
    step: value.step as number,
    parameters: parseTrialParameters(value.params),
    objective,
    state: normalizedState,
  };
};

const parseSseData = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    throw new Error("Petrinaut optimizer returned malformed SSE data");
  }
};

/**
 * Adapt Yannis's optimizer SSE protocol to the canonical NDJSON protocol used
 * by Petrinaut's frontend capability. Chunk boundaries may occur anywhere,
 * including in the middle of a UTF-8 character or SSE line.
 */
export const forwardPetrinautOptimizationStream = async (
  upstream: ReadableStream<Uint8Array>,
  response: ExpressResponse,
  options: {
    direction?: PetrinautOptimizationInput["objective"]["direction"];
    requestedTrials?: number;
    onActivity?: () => void;
    onTerminalEvent?: () => void;
  } = {},
): Promise<void> => {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const requestedTrials = options.requestedTrials ?? 1;
  const direction = options.direction ?? "maximize";
  const streamState = { terminal: false };
  let completedTrials = 0;
  let prunedTrials = 0;
  let failedTrials = 0;
  let best: Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"] =
    null;
  let eventName = "message";
  let dataLines: string[] = [];

  const emit = async (event: PetrinautOptimizationEvent) => {
    if (streamState.terminal) {
      throw new Error(
        "Petrinaut optimizer returned data after a terminal event",
      );
    }
    await writeOptimizationEvent(response, event);
    if (event.type === "complete" || event.type === "error") {
      streamState.terminal = true;
      options.onTerminalEvent?.();
    }
  };

  const emitError = async (value: unknown) => {
    const message =
      isJsonRecord(value) && typeof value.message === "string"
        ? value.message
        : "The optimizer reported an error";
    await emit({
      type: "error",
      code: "optimization_failed",
      message,
      retryable: false,
    });
  };

  const dispatchSseEvent = async () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }

    const data = dataLines.join("\n");
    dataLines = [];
    const currentEventName = eventName;
    eventName = "message";
    if (Buffer.byteLength(data, "utf8") > MAX_OPTIMIZATION_EVENT_BYTES) {
      throw new Error("Petrinaut optimizer returned an oversized event");
    }

    const value = parseSseData(data);
    if (currentEventName === "error") {
      await emitError(value);
      return;
    }
    if (currentEventName === "done") {
      await emit({
        type: "complete",
        requestedTrials,
        completedTrials,
        prunedTrials,
        failedTrials,
        best,
      });
      return;
    }
    if (
      isJsonRecord(value) &&
      typeof value.state === "string" &&
      value.state.toUpperCase() === "ERROR"
    ) {
      await emitError(value);
      return;
    }

    const trial = parseUpstreamTrial(value);
    if (trial.state === "complete") {
      completedTrials += 1;
    } else if (trial.state === "pruned") {
      prunedTrials += 1;
    } else {
      failedTrials += 1;
    }
    if (
      trial.state === "complete" &&
      trial.objective !== null &&
      (best === null ||
        (direction === "maximize"
          ? trial.objective > best.objective
          : trial.objective < best.objective))
    ) {
      best = {
        trial: trial.step,
        parameters: trial.parameters,
        objective: trial.objective,
      };
    }
    await emit({
      type: "trial",
      trial: trial.step,
      parameters: trial.parameters,
      objective: trial.objective,
      state: trial.state,
      best,
    });
  };

  const consumeLine = async (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      await dispatchSseEvent();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }

    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "event") {
      eventName = value || "message";
    } else if (field === "data") {
      dataLines.push(value);
    }
  };

  try {
    await emit({ type: "started", requestedTrials });
    let result = await reader.read();
    while (!result.done) {
      options.onActivity?.();
      buffer += decoder.decode(result.value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        await consumeLine(line);
        newlineIndex = buffer.indexOf("\n");
      }

      if (Buffer.byteLength(buffer, "utf8") > MAX_OPTIMIZATION_EVENT_BYTES) {
        throw new Error("Petrinaut optimizer returned an oversized event");
      }
      result = await reader.read();
    }
    buffer += decoder.decode();
    if (buffer !== "") {
      await consumeLine(buffer);
    }
    await dispatchSseEvent();
    if (!streamState.terminal) {
      throw new Error(
        "Petrinaut optimizer ended without returning a terminal event",
      );
    }
    completed = true;
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
};

/** Mount the authenticated NodeAPI integration for Petrinaut optimization. */
export const setupPetrinautOptimizerHandler = (
  app: Express,
  { origin, fetchImpl = fetch, logger }: PetrinautOptimizerHandlerOptions,
) => {
  let activeOptimizationCount = 0;
  const activeUserIds = new Set<string>();

  app.get(PETRINAUT_OPTIMIZER_CAPABILITIES_PATH, async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    /**
     * This reports deliberate deployment configuration, not live optimizer
     * health. The frontend uses it to decide whether to expose optimization;
     * transient optimizer outages should surface when a run is attempted,
     * not make the feature disappear.
     */
    res.json({ optimization: origin !== null });
  });

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

    const abortForClientDisconnect = () => {
      lifecycle.clientDisconnected = true;
      abortController.abort();
    };
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
      const upstreamResponse = await fetchImpl(
        new URL("/optimize/all", origin),
        {
          method: "POST",
          headers: {
            accept: "text/event-stream",
            "content-type": "application/json",
          },
          body: JSON.stringify(upstreamInput),
          signal: abortController.signal,
        },
      );
      clearTimeout(responseStartTimeout);
      resetIdleTimeout();
      if (!upstreamResponse.ok || !upstreamResponse.body) {
        throw new Error(
          `Petrinaut optimizer returned status ${upstreamResponse.status}`,
        );
      }

      res.status(200);
      res.set({
        "Cache-Control": "no-cache, no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      await forwardPetrinautOptimizationStream(upstreamResponse.body, res, {
        direction: upstreamInput.objective.direction,
        requestedTrials: upstreamInput.study.trials,
        onActivity: resetIdleTimeout,
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
