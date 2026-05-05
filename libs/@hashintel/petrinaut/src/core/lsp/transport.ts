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

  // eslint-disable-next-line no-console
  console.log("[lsp] createWorkerLspTransport: invoking factory");
  void Promise.resolve(createWorker()).then(
    (w) => {
      if (terminated) {
        // eslint-disable-next-line no-console
        console.warn(
          "[lsp] worker booted after transport already terminated, terminating worker",
        );
        w.terminate();
        return;
      }
      // eslint-disable-next-line no-console
      console.log("[lsp] worker constructed", { queuedCount: queued.length });
      worker = w;
      w.addEventListener("message", (event: MessageEvent<ServerMessage>) => {
        // eslint-disable-next-line no-console
        console.log("[lsp] worker → main", event.data);
        for (const listener of listeners) {
          listener(event.data);
        }
      });
      w.addEventListener("error", (event) => {
        // eslint-disable-next-line no-console
        console.error("[lsp] worker error event", event);
      });
      w.addEventListener("messageerror", (event) => {
        // eslint-disable-next-line no-console
        console.error("[lsp] worker messageerror event", event);
      });
      for (const message of queued) {
        // eslint-disable-next-line no-console
        console.log("[lsp] flushing queued message", message);
        w.postMessage(message);
      }
      queued.length = 0;
    },
    (error) => {
      // eslint-disable-next-line no-console
      console.error("[lsp] worker factory rejected", error);
    },
  );

  return {
    send(message) {
      if (worker) {
        // eslint-disable-next-line no-console
        console.log("[lsp] main → worker", message);
        worker.postMessage(message);
      } else if (!terminated) {
        // eslint-disable-next-line no-console
        console.log("[lsp] queueing message (worker not ready)", message);
        queued.push(message);
      } else {
        // eslint-disable-next-line no-console
        console.warn("[lsp] dropped message (transport terminated)", message);
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
