/**
 * In-iframe runtime for the headless half of the eval sandbox.
 *
 * Listens for {@link ParentToSandboxMessage}s and answers each request
 * by either:
 *
 *  - calling `compileScenario` / `compileMetric` (already in-iframe, so
 *    the existing `runSandboxed` + shadowed-globals defenses apply
 *    directly), or
 *  - spawning a real simulation / Monte Carlo `Worker` (which inherits
 *    the iframe's opaque origin, so the worker's `fetch` cannot send
 *    `hash.ai` cookies even if user code calls it).
 *
 * Replies, plus async worker output, are posted back to the parent via
 * `window.parent.postMessage(..., "*")`. Origin is `"*"` because the
 * iframe sandbox has an opaque origin and there's no meaningful
 * `targetOrigin` to use; the parent validates `event.source` instead.
 *
 * The UI runtime (`mountSandboxRuntime` in `@hashintel/petrinaut`) calls
 * this from the `#mode=headless` branch.
 */

import {
  compileMetric,
  type CompiledMetric,
} from "../simulation/authoring/metric/compile-metric";
import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import { createMonteCarloWorker } from "../simulation/monte-carlo/worker/create-monte-carlo-worker";
import { createSimulationWorker } from "../simulation/worker/create-simulation-worker";
import {
  serializeError,
  type ParentToSandboxMessage,
  type SandboxResourceId,
  type SandboxResponse,
  type SandboxToParentMessage,
  type SandboxWorkerKind,
} from "./protocol";

import type { WorkerLike } from "../environment";
import type {
  SandboxErrorEvent,
  SandboxIframeGlobal,
  SandboxMessageEvent,
  SandboxPromiseRejectionEvent,
} from "./browser-types";

// In-iframe browser globals. Petrinaut-core deliberately avoids
// `lib.dom.d.ts`; the structural types in `browser-types.ts` cover what
// the runtime touches.
declare const window: SandboxIframeGlobal;

function createIdGenerator() {
  let evaluatorCount = 0;
  let workerCount = 0;
  return {
    metric: (): SandboxResourceId => {
      evaluatorCount += 1;
      return `metric-${evaluatorCount}` as SandboxResourceId;
    },
    worker: (): SandboxResourceId => {
      workerCount += 1;
      return `worker-${workerCount}` as SandboxResourceId;
    },
  };
}

function postToParent(message: SandboxToParentMessage): void {
  // The sandbox iframe runs in an opaque origin; there is no meaningful
  // `targetOrigin` value other than "*". Parent validates `event.source`.
  window.parent.postMessage(message, "*");
}

/**
 * Mount the headless half of the sandbox runtime in the current iframe.
 *
 * Installs a global `message` listener, plus `error` and
 * `unhandledrejection` listeners that forward to the parent.
 *
 * Returns a teardown function; the UI runtime calls this on cleanup.
 */
export function mountCoreSandboxRuntime(): () => void {
  const ids = createIdGenerator();

  const evaluators = new Map<SandboxResourceId, CompiledMetric>();
  const workersById = new Map<SandboxResourceId, WorkerLike>();
  const workerListeners = new Map<
    SandboxResourceId,
    (event: { data: unknown }) => void
  >();

  const sendResponse = (requestId: string, response: SandboxResponse): void => {
    postToParent({ type: "response", requestId, response });
  };

  const sendResponseError = (requestId: string, error: unknown): void => {
    postToParent({
      type: "responseError",
      requestId,
      error: serializeError(error),
    });
  };

  const createWorker = async (
    kind: SandboxWorkerKind,
  ): Promise<SandboxResourceId> => {
    const worker =
      kind === "simulation"
        ? await createSimulationWorker()
        : await createMonteCarloWorker();
    const workerId = ids.worker();
    workersById.set(workerId, worker);
    const listener = (event: { data: unknown }) => {
      postToParent({
        type: "workerMessage",
        workerId,
        message: event.data,
      });
    };
    workerListeners.set(workerId, listener);
    worker.addEventListener("message", listener);
    return workerId;
  };

  const handleRequest = async (
    requestId: string,
    request: Extract<ParentToSandboxMessage, { type: "request" }>["request"],
  ): Promise<void> => {
    try {
      switch (request.kind) {
        case "compileScenario": {
          const { args } = request;
          const outcome = compileScenario(
            args.scenario,
            args.netParameters,
            args.places,
            args.types,
            args.scenarioParameterValues
              ? { scenarioParameterValues: args.scenarioParameterValues }
              : undefined,
          );
          sendResponse(requestId, { kind: "compileScenario", outcome });
          break;
        }
        case "createMetricEvaluator": {
          const outcome = compileMetric(request.metric);
          if (!outcome.ok) {
            sendResponseError(requestId, new Error(outcome.error));
            return;
          }
          const evaluatorId = ids.metric();
          evaluators.set(evaluatorId, outcome.fn);
          sendResponse(requestId, {
            kind: "createMetricEvaluator",
            evaluatorId,
          });
          break;
        }
        case "evaluateMetric": {
          const fn = evaluators.get(request.evaluatorId);
          if (!fn) {
            sendResponseError(
              requestId,
              new Error(`Unknown metric evaluator: ${request.evaluatorId}`),
            );
            return;
          }
          try {
            const value = fn(request.state);
            sendResponse(requestId, {
              kind: "evaluateMetric",
              result: value,
            });
          } catch (err) {
            sendResponse(requestId, {
              kind: "evaluateMetric",
              result: {
                error: err instanceof Error ? err.message : String(err),
              },
            });
          }
          break;
        }
        case "evaluateMetricBatch": {
          const fn = evaluators.get(request.evaluatorId);
          if (!fn) {
            sendResponseError(
              requestId,
              new Error(`Unknown metric evaluator: ${request.evaluatorId}`),
            );
            return;
          }
          const results = request.states.map(
            (state): number | { error: string } => {
              try {
                return fn(state);
              } catch (err) {
                return {
                  error: err instanceof Error ? err.message : String(err),
                };
              }
            },
          );
          sendResponse(requestId, {
            kind: "evaluateMetricBatch",
            results,
          });
          break;
        }
        case "disposeMetricEvaluator": {
          evaluators.delete(request.evaluatorId);
          sendResponse(requestId, { kind: "disposeMetricEvaluator" });
          break;
        }
        case "createWorker": {
          const workerId = await createWorker(request.workerKind);
          sendResponse(requestId, { kind: "createWorker", workerId });
          break;
        }
        case "ping": {
          sendResponse(requestId, { kind: "ping" });
          break;
        }
      }
    } catch (err) {
      sendResponseError(requestId, err);
    }
  };

  const messageListener = (event: SandboxMessageEvent): void => {
    if (event.source !== window.parent) {
      return;
    }
    const data = event.data as ParentToSandboxMessage | null;
    if (!data || typeof data !== "object" || !("type" in data)) {
      return;
    }
    switch (data.type) {
      case "request":
        void handleRequest(data.requestId, data.request);
        break;
      case "workerMessage": {
        const worker = workersById.get(data.workerId);
        if (worker) {
          worker.postMessage(data.message);
        }
        break;
      }
      case "workerTerminate": {
        const worker = workersById.get(data.workerId);
        if (worker) {
          worker.terminate();
        }
        workersById.delete(data.workerId);
        workerListeners.delete(data.workerId);
        break;
      }
    }
  };

  const errorListener = (event: SandboxErrorEvent): void => {
    postToParent({
      type: "uncaughtError",
      origin: "sandbox",
      error: serializeError(event.error ?? event.message),
    });
  };

  const rejectionListener = (event: SandboxPromiseRejectionEvent): void => {
    postToParent({
      type: "uncaughtError",
      origin: "sandbox",
      error: serializeError(event.reason),
    });
  };

  window.addEventListener("message", messageListener);
  window.addEventListener("error", errorListener);
  window.addEventListener("unhandledrejection", rejectionListener);

  // Announce readiness so the parent can flush its pre-ready queue.
  postToParent({ type: "ready" });

  return function teardown(): void {
    window.removeEventListener("message", messageListener);
    window.removeEventListener("error", errorListener);
    window.removeEventListener("unhandledrejection", rejectionListener);
    for (const worker of workersById.values()) {
      try {
        worker.terminate();
      } catch {
        // Already torn down.
      }
    }
    workersById.clear();
    workerListeners.clear();
    evaluators.clear();
  };
}
