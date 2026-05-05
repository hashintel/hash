import type { ToMainMessage, ToWorkerMessage } from "./worker/messages";

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

  // eslint-disable-next-line no-console
  console.log("[sim] createWorkerTransport: invoking factory");
  void Promise.resolve(createWorker()).then(
    (w) => {
      if (terminated) {
        // eslint-disable-next-line no-console
        console.warn(
          "[sim] worker booted after transport already terminated, terminating worker",
        );
        w.terminate();
        return;
      }
      // eslint-disable-next-line no-console
      console.log("[sim] worker constructed", {
        queuedCount: queued.length,
      });
      worker = w;
      w.addEventListener("message", (event: MessageEvent<ToMainMessage>) => {
        // eslint-disable-next-line no-console
        console.log("[sim] worker → main", event.data.type, event.data);
        for (const listener of listeners) {
          listener(event.data);
        }
      });
      w.addEventListener("error", (event) => {
        // eslint-disable-next-line no-console
        console.error("[sim] worker error event", event);
      });
      w.addEventListener("messageerror", (event) => {
        // eslint-disable-next-line no-console
        console.error("[sim] worker messageerror event", event);
      });
      for (const message of queued) {
        // eslint-disable-next-line no-console
        console.log("[sim] flushing queued message", message.type);
        w.postMessage(message);
      }
      queued.length = 0;
    },
    (error) => {
      // eslint-disable-next-line no-console
      console.error("[sim] worker factory rejected", error);
    },
  );

  return {
    send(message) {
      if (worker) {
        // eslint-disable-next-line no-console
        console.log("[sim] main → worker", message.type);
        worker.postMessage(message);
      } else if (!terminated) {
        // eslint-disable-next-line no-console
        console.log("[sim] queueing message (worker not ready)", message.type);
        queued.push(message);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          "[sim] dropped message (transport terminated)",
          message.type,
        );
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
      // eslint-disable-next-line no-console
      console.log("[sim] transport.terminate() called");
      terminated = true;
      worker?.terminate();
      worker = null;
      listeners.clear();
      queued.length = 0;
    },
  };
}
