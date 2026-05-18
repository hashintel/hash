import type { ClientMessage, ServerMessage } from "./worker/protocol";

/**
 * Protocol-level abstraction over the language-server worker. Decouples the
 * {@link LanguageClient} from how the server is actually run — Web Worker,
 * inline same-thread, recorded replay, or a Node `worker_threads` polyfill
 * all satisfy this shape. Mirrors {@link import("../simulation").SimulationTransport}.
 */
export interface LspTransport {
  /** Send a message to the server. May queue if the transport is not yet ready. */
  send(message: ClientMessage): void;
  /** Subscribe to messages from the server. Returns an unsubscribe function. */
  onMessage(listener: (message: ServerMessage) => void): () => void;
  /** Tear down the underlying worker / runtime. Idempotent. */
  terminate(): void;
}

export type LspWorkerFactory = () => Worker | Promise<Worker>;

/**
 * Wrap a `Worker` factory in an {@link LspTransport}. Messages sent before the
 * worker is ready are queued and flushed once it boots.
 */
export function createWorkerLspTransport(
  createWorker: LspWorkerFactory,
): LspTransport {
  const listeners = new Set<(message: ServerMessage) => void>();
  let worker: Worker | null = null;
  let terminated = false;
  const queued: ClientMessage[] = [];

  void Promise.resolve(createWorker()).then((w) => {
    if (terminated) {
      w.terminate();
      return;
    }
    worker = w;
    w.addEventListener("message", (event: MessageEvent<ServerMessage>) => {
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
