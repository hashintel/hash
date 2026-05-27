/**
 * Parent-side iframe implementation of {@link CoreEvalSandbox}.
 *
 * Constructs RPC envelopes ({@link ParentToSandboxMessage}) and ships
 * them to the supplied iframe `Window`. Replies arrive asynchronously
 * via a single `message` listener on the parent's `window`; we filter by
 * `event.source === iframeWindow` so other iframes / extensions can't
 * forge responses.
 *
 * Workers run *inside* the iframe (so they inherit its opaque origin).
 * The parent receives {@link WorkerLike} proxies whose `postMessage` /
 * `addEventListener` translate into `workerMessage` envelopes.
 *
 * No transferables — frame payloads round-trip through structured
 * clone. See the plan's "Deferred: full Transferables" section for the
 * engine refactor needed to fix that.
 */

import {
  deserializeError,
  type ParentToSandboxMessage,
  type RequestId,
  type SandboxResourceId,
  type SandboxResponse,
  type SandboxToParentMessage,
  type SandboxWorkerKind,
  type SerializedError,
} from "./protocol";

import type { WorkerLike, WorkerMessageHandler } from "../environment";
import type { MetricState } from "../simulation/authoring/metric/compile-metric";
import type { Metric } from "../types/sdcpn";
import type {
  SandboxIframeWindow,
  SandboxMessageEvent,
  SandboxParentGlobal,
} from "./browser-types";
import type {
  CompileScenarioArgs,
  CompileScenarioOutcome,
  CoreEvalSandbox,
  MetricEvaluator,
} from "./interface";

// Browser globals — declared locally because petrinaut-core does not depend
// on `lib.dom.d.ts`. See {@link SandboxParentGlobal} / browser-types.ts.
declare const window: SandboxParentGlobal;

export interface CreateIframeCoreSandboxOptions {
  /**
   * The iframe's `contentWindow`. The caller is responsible for the
   * iframe lifecycle (DOM placement, `sandbox` attribute, `src`, etc.).
   * Pass the window once it exists; the sandbox buffers requests until
   * the iframe's `ready` message arrives.
   */
  iframeWindow: SandboxIframeWindow;
  /**
   * Optional callback for errors forwarded from inside the iframe (from
   * its `window.error` / `unhandledrejection` listeners, or rejected RPC
   * responses with no awaiting caller). The React layer wires this to
   * `ErrorTrackerContext.captureException` so Sentry sees sandbox-side
   * errors.
   */
  onUncaughtError?: (error: Error, origin: "sandbox" | "visualizer") => void;
}

type PendingRequest = {
  resolve: (response: SandboxResponse) => void;
  reject: (error: Error) => void;
};

let requestCounter = 0;
const nextRequestId = (): RequestId => `req-${++requestCounter}`;

/**
 * Build a parent-side {@link CoreEvalSandbox} that proxies every
 * operation to the supplied sandbox iframe.
 */
export function createIframeCoreSandbox(
  options: CreateIframeCoreSandboxOptions,
): CoreEvalSandbox {
  const { iframeWindow, onUncaughtError } = options;

  const pending = new Map<RequestId, PendingRequest>();
  const workerListeners = new Map<
    SandboxResourceId,
    Set<WorkerMessageHandler>
  >();
  const evaluators = new Set<MetricEvaluator>();
  const workers = new Set<WorkerLike>();

  let ready = false;
  let disposed = false;
  const beforeReadyQueue: ParentToSandboxMessage[] = [];
  const readyListeners = new Set<() => void>();

  const send = (message: ParentToSandboxMessage): void => {
    if (disposed) {
      throw new Error("CoreEvalSandbox: disposed");
    }
    if (!ready) {
      beforeReadyQueue.push(message);
      return;
    }
    iframeWindow.postMessage(message, "*");
  };

  const awaitReady = (): Promise<void> => {
    if (ready) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      readyListeners.add(resolve);
    });
  };

  const handleResponse = (
    requestId: RequestId,
    response: SandboxResponse,
  ): void => {
    const entry = pending.get(requestId);
    if (!entry) {
      return;
    }
    pending.delete(requestId);
    entry.resolve(response);
  };

  const handleResponseError = (
    requestId: RequestId,
    error: SerializedError,
  ): void => {
    const entry = pending.get(requestId);
    if (!entry) {
      onUncaughtError?.(deserializeError(error), "sandbox");
      return;
    }
    pending.delete(requestId);
    entry.reject(deserializeError(error));
  };

  const handleWorkerMessage = (
    workerId: SandboxResourceId,
    message: unknown,
  ): void => {
    const listeners = workerListeners.get(workerId);
    if (!listeners || listeners.size === 0) {
      return;
    }
    const envelope = { data: message };
    for (const listener of listeners) {
      try {
        listener(envelope);
      } catch (err) {
        onUncaughtError?.(
          err instanceof Error ? err : new Error(String(err)),
          "sandbox",
        );
      }
    }
  };

  const messageListener = (event: SandboxMessageEvent): void => {
    if (event.source !== iframeWindow) {
      return;
    }
    const data = event.data as SandboxToParentMessage | null;
    if (!data || typeof data !== "object" || !("type" in data)) {
      return;
    }
    switch (data.type) {
      case "ready": {
        ready = true;
        for (const message of beforeReadyQueue) {
          iframeWindow.postMessage(message, "*");
        }
        beforeReadyQueue.length = 0;
        for (const listener of readyListeners) {
          listener();
        }
        readyListeners.clear();
        break;
      }
      case "response":
        handleResponse(data.requestId, data.response);
        break;
      case "responseError":
        handleResponseError(data.requestId, data.error);
        break;
      case "workerMessage":
        handleWorkerMessage(data.workerId, data.message);
        break;
      case "uncaughtError":
        onUncaughtError?.(deserializeError(data.error), data.origin);
        break;
    }
  };

  // The listener lives on the parent window. Use `window` rather than
  // `iframeWindow` because the iframe's `postMessage` targets the parent,
  // and messages arrive on the parent's window.
  window.addEventListener("message", messageListener);

  const request = async (
    payload: Extract<ParentToSandboxMessage, { type: "request" }>["request"],
  ): Promise<SandboxResponse> => {
    if (disposed) {
      throw new Error("CoreEvalSandbox: disposed");
    }
    const requestId = nextRequestId();
    return new Promise<SandboxResponse>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      send({ type: "request", requestId, request: payload });
    });
  };

  const buildMetricEvaluator = (
    evaluatorId: SandboxResourceId,
  ): MetricEvaluator => {
    let evaluatorDisposed = false;
    const ensureLive = () => {
      if (evaluatorDisposed) {
        throw new Error("MetricEvaluator: already disposed");
      }
      if (disposed) {
        throw new Error("CoreEvalSandbox: disposed");
      }
    };

    const evaluator: MetricEvaluator = {
      async evaluate(state: MetricState) {
        ensureLive();
        const response = await request({
          kind: "evaluateMetric",
          evaluatorId,
          state,
        });
        if (response.kind !== "evaluateMetric") {
          throw new Error("Unexpected sandbox response for evaluateMetric");
        }
        if (typeof response.result === "number") {
          return response.result;
        }
        throw new Error(response.result.error);
      },
      async evaluateBatch(states: MetricState[]) {
        ensureLive();
        const response = await request({
          kind: "evaluateMetricBatch",
          evaluatorId,
          states,
        });
        if (response.kind !== "evaluateMetricBatch") {
          throw new Error(
            "Unexpected sandbox response for evaluateMetricBatch",
          );
        }
        return response.results;
      },
      dispose() {
        if (evaluatorDisposed) {
          return;
        }
        evaluatorDisposed = true;
        evaluators.delete(evaluator);
        if (disposed) {
          return;
        }
        // Fire-and-forget; we don't await the disposal reply.
        void request({ kind: "disposeMetricEvaluator", evaluatorId }).catch(
          () => {
            // The iframe may have already been torn down.
          },
        );
      },
    };
    return evaluator;
  };

  const buildWorkerProxy = (workerId: SandboxResourceId): WorkerLike => {
    const listeners = new Set<WorkerMessageHandler>();
    workerListeners.set(workerId, listeners);
    let terminated = false;

    const proxy: WorkerLike = {
      postMessage(message) {
        if (terminated || disposed) {
          return;
        }
        send({ type: "workerMessage", workerId, message });
      },
      addEventListener(_type, listener) {
        listeners.add(listener);
      },
      removeEventListener(_type, listener) {
        listeners.delete(listener);
      },
      terminate() {
        if (terminated) {
          return;
        }
        terminated = true;
        listeners.clear();
        workerListeners.delete(workerId);
        workers.delete(proxy);
        if (disposed) {
          return;
        }
        send({ type: "workerTerminate", workerId });
      },
    };
    workers.add(proxy);
    return proxy;
  };

  const createWorker = async (kind: SandboxWorkerKind): Promise<WorkerLike> => {
    await awaitReady();
    const response = await request({ kind: "createWorker", workerKind: kind });
    if (response.kind !== "createWorker") {
      throw new Error("Unexpected sandbox response for createWorker");
    }
    return buildWorkerProxy(response.workerId);
  };

  return {
    async compileScenario(
      args: CompileScenarioArgs,
    ): Promise<CompileScenarioOutcome> {
      await awaitReady();
      const response = await request({ kind: "compileScenario", args });
      if (response.kind !== "compileScenario") {
        throw new Error("Unexpected sandbox response for compileScenario");
      }
      return response.outcome;
    },

    async createMetricEvaluator(metric: Metric): Promise<MetricEvaluator> {
      await awaitReady();
      const response = await request({ kind: "createMetricEvaluator", metric });
      if (response.kind !== "createMetricEvaluator") {
        throw new Error(
          "Unexpected sandbox response for createMetricEvaluator",
        );
      }
      const evaluator = buildMetricEvaluator(response.evaluatorId);
      evaluators.add(evaluator);
      return evaluator;
    },

    createSimulationWorker() {
      return createWorker("simulation");
    },

    createMonteCarloWorker() {
      return createWorker("monte-carlo");
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      window.removeEventListener("message", messageListener);
      for (const { reject } of pending.values()) {
        reject(new Error("CoreEvalSandbox: disposed"));
      }
      pending.clear();
      for (const evaluator of evaluators) {
        evaluator.dispose();
      }
      evaluators.clear();
      for (const worker of workers) {
        try {
          worker.terminate();
        } catch {
          // Already torn down.
        }
      }
      workers.clear();
      workerListeners.clear();
      readyListeners.clear();
      beforeReadyQueue.length = 0;
    },
  };
}
