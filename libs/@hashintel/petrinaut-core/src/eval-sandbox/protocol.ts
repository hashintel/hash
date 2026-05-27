/**
 * postMessage protocol for the iframe-backed eval sandbox.
 *
 * Two directions:
 *
 * - **Parent → sandbox** ({@link ParentToSandboxMessage}): RPC requests
 *   (`compileScenario`, `createMetricEvaluator`, `evaluateMetricBatch`,
 *   …) plus worker-pipe envelopes (`createSimulationWorker`,
 *   `workerMessage`, `workerTerminate`).
 * - **Sandbox → parent** ({@link SandboxToParentMessage}): RPC replies
 *   (`response`) keyed by `requestId`, plus async worker-pipe envelopes
 *   (`workerMessage`), plus error envelopes from the iframe's global
 *   error handlers.
 *
 * The protocol is intentionally JSON-serialisable (the iframe is
 * cross-origin from the parent's perspective because of its opaque
 * `sandbox="allow-scripts"` origin; structured clone with no
 * `Transferable`s is the simplest baseline).
 *
 * Worker message payloads (`workerMessage.message`) are passed through
 * unchanged — the parent's worker proxy and the simulation/Monte-Carlo
 * transports interpret them via the existing
 * `simulation/worker/messages.ts` and `monte-carlo/worker/messages.ts`
 * types.
 */

import type { MetricState } from "../simulation/authoring/metric/compile-metric";
import type {
  CompiledScenarioResult,
  CompileScenarioOutcome,
} from "../simulation/authoring/scenario/compile-scenario";
import type { Metric } from "../types/sdcpn";
import type { CompileScenarioArgs } from "./interface";

/** Opaque correlation id for matching a `response` to its request. */
export type RequestId = string;

/** Opaque sandbox-assigned id for a worker proxy or metric evaluator. */
export type SandboxResourceId = string;

export type SandboxWorkerKind = "simulation" | "monte-carlo";

/**
 * Wire-format for an Error propagated across the sandbox boundary.
 *
 * Parent reconstructs an `Error` from this; Sentry-style trackers accept
 * any thrown value, so name/message/stack/cause is sufficient.
 */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
}

/* -------------------------------------------------------------------------- */
/* Parent → Sandbox                                                           */
/* -------------------------------------------------------------------------- */

export type ParentRequest =
  | { kind: "compileScenario"; args: CompileScenarioArgs }
  | { kind: "createMetricEvaluator"; metric: Metric }
  | {
      kind: "evaluateMetric";
      evaluatorId: SandboxResourceId;
      state: MetricState;
    }
  | {
      kind: "evaluateMetricBatch";
      evaluatorId: SandboxResourceId;
      states: MetricState[];
    }
  | { kind: "disposeMetricEvaluator"; evaluatorId: SandboxResourceId }
  | { kind: "createWorker"; workerKind: SandboxWorkerKind }
  | { kind: "ping" };

export type ParentToSandboxMessage =
  | {
      type: "request";
      requestId: RequestId;
      request: ParentRequest;
    }
  | {
      /** Pipe a worker message through to the sandbox-owned worker. */
      type: "workerMessage";
      workerId: SandboxResourceId;
      message: unknown;
    }
  | {
      /** Terminate the sandbox-owned worker. */
      type: "workerTerminate";
      workerId: SandboxResourceId;
    };

/* -------------------------------------------------------------------------- */
/* Sandbox → Parent                                                           */
/* -------------------------------------------------------------------------- */

export type SandboxResponse =
  | { kind: "compileScenario"; outcome: CompileScenarioOutcome }
  | { kind: "createMetricEvaluator"; evaluatorId: SandboxResourceId }
  | { kind: "evaluateMetric"; result: number | { error: string } }
  | {
      kind: "evaluateMetricBatch";
      results: (number | { error: string })[];
    }
  | { kind: "disposeMetricEvaluator" }
  | { kind: "createWorker"; workerId: SandboxResourceId }
  | { kind: "ping" };

export type SandboxToParentMessage =
  | { type: "ready" }
  | {
      type: "response";
      requestId: RequestId;
      response: SandboxResponse;
    }
  | {
      type: "responseError";
      requestId: RequestId;
      error: SerializedError;
    }
  | {
      /** Async message from a sandbox-owned worker back to the parent. */
      type: "workerMessage";
      workerId: SandboxResourceId;
      message: unknown;
    }
  | {
      /**
       * Uncaught error inside the iframe (from window.error /
       * unhandledrejection). Forwarded for the parent's error tracker.
       */
      type: "uncaughtError";
      origin: "sandbox" | "visualizer";
      error: SerializedError;
    };

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Convert any thrown value into a serializable envelope. */
export function serializeError(value: unknown): SerializedError {
  if (value instanceof Error) {
    const serialized: SerializedError = {
      name: value.name,
      message: value.message,
    };
    if (value.stack) {
      serialized.stack = value.stack;
    }
    if (value.cause !== undefined) {
      serialized.cause = serializeError(value.cause);
    }
    return serialized;
  }
  return {
    name: "NonError",
    message: typeof value === "string" ? value : String(value),
  };
}

/** Rebuild an `Error` from a {@link SerializedError} envelope. */
export function deserializeError(serialized: SerializedError): Error {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  if (serialized.stack) {
    error.stack = serialized.stack;
  }
  if (serialized.cause) {
    (error as Error & { cause?: unknown }).cause = deserializeError(
      serialized.cause,
    );
  }
  return error;
}

/**
 * Re-export {@link CompiledScenarioResult} for callers importing only the
 * protocol module.
 */
export type { CompiledScenarioResult };
