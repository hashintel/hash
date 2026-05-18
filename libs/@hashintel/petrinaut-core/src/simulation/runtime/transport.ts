import type { ToMainMessage } from "../worker/messages";
import type { SimulationTransport, WorkerFactory } from "../api";

/**
 * Wrap a `Worker` factory in a {@link SimulationTransport}. Messages sent
 * before the worker is ready are queued and flushed once it boots.
 */
export function createWorkerTransport(
  createWorker: WorkerFactory,
): SimulationTransport {
  const listeners = new Set<(message: unknown) => void>();
  let worker: Worker | null = null;
  let terminated = false;
  const queued: unknown[] = [];

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
