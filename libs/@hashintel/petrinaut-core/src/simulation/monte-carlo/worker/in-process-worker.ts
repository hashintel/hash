/**
 * The Monte Carlo worker protocol running on the calling thread.
 *
 * Hosts without a thread primitive — unit tests, or a runtime whose worker
 * entry file is unavailable — get the same protocol over a plain callback
 * loopback. Compute batches still yield through `setTimeout`, so the calling
 * thread is shared rather than blocked, but nothing runs in parallel: this is
 * the correctness fallback, not the fast path.
 */
import { attachMonteCarloWorker } from "./attach";

import type { WorkerLike } from "../../../environment";
import type {
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
} from "./messages";

// The core compiles against neither DOM nor Node types, so the host's
// scheduling primitives are reached structurally, as `runtime/experiment.ts`
// does for its own yield.
const scheduler = globalThis as {
  queueMicrotask?: (callback: () => void) => void;
  setTimeout?: (handler: () => void, timeout?: number) => unknown;
};

function onMicrotask(callback: () => void): void {
  if (scheduler.queueMicrotask) {
    scheduler.queueMicrotask(callback);
  } else {
    void Promise.resolve().then(callback);
  }
}

export function createInProcessMonteCarloWorker(): WorkerLike {
  const mainListeners = new Set<(event: { data: unknown }) => void>();
  let workerListener: ((message: MonteCarloToWorkerMessage) => void) | null =
    null;
  let terminated = false;

  attachMonteCarloWorker({
    postMessage: (message: MonteCarloToMainMessage) => {
      if (terminated) {
        return;
      }
      // Delivered on a microtask so a message posted while handling `init`
      // reaches listeners added after `postMessage` returned, matching how a
      // real worker's replies are always asynchronous.
      onMicrotask(() => {
        if (terminated) {
          return;
        }
        for (const listener of mainListeners) {
          listener({ data: message });
        }
      });
    },
    onMessage: (listener) => {
      workerListener = listener;
    },
    delay: (timeout) =>
      new Promise((resolve) => {
        if (scheduler.setTimeout) {
          scheduler.setTimeout(() => resolve(undefined), timeout);
        } else {
          onMicrotask(() => resolve(undefined));
        }
      }),
  });

  return {
    postMessage(message) {
      if (terminated) {
        return;
      }
      onMicrotask(() => {
        if (!terminated) {
          workerListener?.(message as MonteCarloToWorkerMessage);
        }
      });
    },
    addEventListener(_type, listener) {
      mainListeners.add(listener);
    },
    removeEventListener(_type, listener) {
      mainListeners.delete(listener);
    },
    terminate() {
      // A `cancel` posted just before terminating still sits on a microtask,
      // so deliver it now: the protocol's handler is synchronous and stops the
      // compute loop before the loopback closes.
      workerListener?.({ type: "cancel" });
      terminated = true;
      mainListeners.clear();
      workerListener = null;
    },
  };
}
