import { once } from "node:events";

import {
  petrinautOptimizationErrorEventSchema,
  petrinautOptimizationEventSchema,
  petrinautOptimizationInputSchema,
} from "@hashintel/petrinaut-core";

import type { paths } from "@local/petrinaut-optimizer-types";
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
const MAX_OPTIMIZATION_EVENT_BYTES = 64 * 1024;
const MAX_CONCURRENT_OPTIMIZATIONS = 4;

type PetrinautOptimizerStatus =
  paths["/status"]["get"]["responses"][200]["content"]["application/json"];
type PetrinautOptimizerOptimizationInput =
  paths["/optimize"]["post"]["requestBody"]["content"]["application/json"];
type PetrinautOptimizerOptimizationEvent =
  paths["/optimize"]["post"]["responses"][200]["content"]["application/x-ndjson"];

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
    updated_at: updatedAt,
  } = value as Record<string, unknown>;

  return (
    isPetrinautOptimizerPhase(phase) &&
    (detail === undefined || detail === null || typeof detail === "string") &&
    (updatedAt === undefined ||
      updatedAt === null ||
      typeof updatedAt === "string")
  );
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
  const upstreamEvent: PetrinautOptimizerOptimizationEvent = parsed.data;
  if (!response.write(`${JSON.stringify(upstreamEvent)}\n`)) {
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

/**
 * Parse and validate an NDJSON stream incrementally. Chunk boundaries may occur
 * anywhere, including in the middle of a UTF-8 character or JSON line.
 */
export const forwardPetrinautOptimizationStream = async (
  upstream: ReadableStream<Uint8Array>,
  response: ExpressResponse,
  options: {
    onEvent?: () => void;
    onTerminalEvent?: () => void;
  } = {},
): Promise<void> => {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  type StreamState = { started: boolean; terminal: boolean };
  let streamState: StreamState = { started: false, terminal: false };

  const consumeLine = async (
    line: string,
    state: StreamState,
  ): Promise<StreamState> => {
    if (Buffer.byteLength(line, "utf8") > MAX_OPTIMIZATION_EVENT_BYTES) {
      throw new Error("Petrinaut optimizer returned an oversized event");
    }
    if (line.trim() === "") {
      return state;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error("Petrinaut optimizer returned malformed NDJSON");
    }
    const parsedEvent = petrinautOptimizationEventSchema.safeParse(value);
    if (!parsedEvent.success) {
      throw new Error("Petrinaut optimizer returned an invalid event");
    }
    const event = parsedEvent.data;
    if (state.terminal) {
      throw new Error(
        "Petrinaut optimizer returned data after a terminal event",
      );
    }
    if (event.type === "started") {
      if (state.started) {
        throw new Error("Petrinaut optimizer returned duplicate start events");
      }
    } else if (event.type !== "error" && !state.started) {
      throw new Error("Petrinaut optimizer returned an event before starting");
    }
    await writeOptimizationEvent(response, event);
    options.onEvent?.();
    if (event.type === "complete" || event.type === "error") {
      options.onTerminalEvent?.();
    }
    return {
      started: state.started || event.type === "started",
      terminal: event.type === "complete" || event.type === "error",
    };
  };

  try {
    let result = await reader.read();
    while (!result.done) {
      buffer += decoder.decode(result.value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        streamState = await consumeLine(line, streamState);
        newlineIndex = buffer.indexOf("\n");
      }

      if (Buffer.byteLength(buffer, "utf8") > MAX_OPTIMIZATION_EVENT_BYTES) {
        throw new Error("Petrinaut optimizer returned an oversized event");
      }
      result = await reader.read();
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") {
      streamState = await consumeLine(buffer, streamState);
    }
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
      if (!isPetrinautOptimizerStatus(status)) {
        throw new Error(
          "Petrinaut optimizer returned an invalid status payload",
        );
      }
      res.json(status);
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
    const upstreamInput: PetrinautOptimizerOptimizationInput = input.data;

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
      const upstreamResponse = await fetchImpl(new URL("/optimize", origin), {
        method: "POST",
        headers: {
          accept: "application/x-ndjson",
          "content-type": "application/json",
        },
        body: JSON.stringify(upstreamInput),
        signal: abortController.signal,
      });
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
        onEvent: resetIdleTimeout,
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
