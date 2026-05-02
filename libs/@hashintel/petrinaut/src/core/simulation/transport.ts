import type {
  ToMainMessage,
  ToWorkerMessage,
} from "../../simulation/worker/messages";

/**
 * Protocol-level abstraction over the simulation worker. Decouples the
 * `Simulation` handle from how the engine is actually run — Worker, inline,
 * recorded replay, or a Node `worker_threads` polyfill all satisfy this shape.
 *
 * See [05-simulation.md](../../../rfc/0001-core-react-ui-split/05-simulation.md) §5.1.
 */
export interface SimulationTransport {
  /** Send a message to the engine. May queue if the transport is not yet ready. */
  send(message: ToWorkerMessage): void;
  /** Subscribe to messages from the engine. Returns an unsubscribe function. */
  onMessage(listener: (message: ToMainMessage) => void): () => void;
  /** Tear down the underlying worker / runtime. Idempotent. */
  terminate(): void;
}

export type WorkerFactory = () => Worker | Promise<Worker>;

/**
 * Wrap a `Worker` factory in a {@link SimulationTransport}. Messages sent
 * before the worker is ready are queued and flushed once it boots.
 */
export function createWorkerTransport(
  createWorker: WorkerFactory,
): SimulationTransport {
  const listeners = new Set<(message: ToMainMessage) => void>();
  let worker: Worker | null = null;
  let terminated = false;
  const queued: ToWorkerMessage[] = [];

  void Promise.resolve(createWorker()).then((w) => {
    if (terminated) {
      w.terminate();
      return;
    }
    worker = w;
    w.addEventListener("message", (event: MessageEvent<ToMainMessage>) => {
      for (const listener of listeners) {
        listener(event.data);
      }
    });
    for (const message of queued) {
      w.postMessage(message);
    }
    queued.length = 0;
  });

  return {
    send(message) {
      if (worker) {
        worker.postMessage(message);
      } else if (!terminated) {
        queued.push(message);
      }
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    terminate() {
      if (terminated) {
        return;
      }
      terminated = true;
      worker?.terminate();
      worker = null;
      listeners.clear();
      queued.length = 0;
    },
  };
}
