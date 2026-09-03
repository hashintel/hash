/**
 * A worker factory that recycles workers instead of terminating them.
 *
 * The experiment runtime creates one worker per shard per experiment and
 * terminates them on dispose — correct, but a parameter sweep instantiates a
 * batch per ladder rung and per surface chunk, so a single slider commit
 * used to spawn (and kill) a whole pool's worth of workers. Each spawn costs
 * little main-thread time; the real price is the worker re-fetching and
 * re-evaluating the engine module and re-receiving the compiled model before
 * it can simulate.
 *
 * The Monte Carlo worker protocol is re-initializable by design: `init`
 * rebuilds the simulator from scratch and `cancel` discards it, so a worker
 * that finished (or was cancelled) is safe to hand to the next experiment.
 * This factory leases workers: `terminate()` on a lease detaches its
 * listeners, sends `cancel` to reset the worker, and returns it to an idle
 * pool instead of killing it. Callers keep the exact `WorkerFactory`
 * contract — the pooling is invisible to the transport and the runtime.
 *
 * The one delicate part is WHEN a released worker may re-enter the pool. A
 * `cancelled` reply that arrives after the next lease attached its listeners
 * would be read by the experiment runtime as its own shard settling, so the
 * worker is pooled only once every acknowledgement it still owes has
 * arrived. Acks are FIFO and the worker answers every `cancel` — including
 * the one the runtime's dispose path sends through the lease right before
 * terminating it — so the reset's own ack is always the last one owed: the
 * lease counts cancels out and acks in, and the release waits for the
 * difference plus its own.
 */
import type { WorkerFactoryLike, WorkerLike } from "../../environment";

type MessageListener = (event: { data: unknown }) => void;

export type ReusableWorkerFactory = (() => Promise<WorkerLike>) & {
  /** Terminates every idle or resetting worker; leases in flight are unaffected. */
  drain(): void;
  /**
   * Drains and shuts the pool: from here on a released worker is terminated
   * instead of pooled (its late reset ack pools nothing), and a new lease
   * gets a fresh, unpooled worker. For hosts that unmount — leases released
   * after this point must die even though their acks arrive later.
   */
  dispose(): void;
};

function isCancelledAck(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === "object" &&
    (data as { type?: unknown }).type === "cancelled"
  );
}

export function createReusableWorkerFactory(
  createWorker: WorkerFactoryLike,
  { maxIdle = 8 }: { maxIdle?: number } = {},
): ReusableWorkerFactory {
  const idle: WorkerLike[] = [];
  /** Reset in flight: `cancel` posted, its final `cancelled` ack not yet seen. */
  const resetting = new Set<WorkerLike>();
  const broken = new WeakSet<WorkerLike>();
  let ended = false;

  const acquire = async (): Promise<WorkerLike> => {
    const pooled = idle.pop();
    if (pooled) {
      return pooled;
    }
    const worker = await createWorker();
    // A worker whose script crashed goes silent rather than erroring through
    // the protocol; it must never be re-pooled. `WorkerLike` only models
    // "message", so the error hook is best-effort where the host supports it.
    (worker.addEventListener as (type: string, listener: () => void) => void)(
      "error",
      () => {
        broken.add(worker);
      },
    );
    return worker;
  };

  /**
   * Resets the worker and pools it once it has answered every `cancel` it
   * owes. `owedAcks` counts cancels the ending lease sent whose replies had
   * not arrived by terminate time; the reset's own cancel adds one more, and
   * message order guarantees the last of those acks is the reset's.
   */
  const release = (worker: WorkerLike, owedAcks: number): void => {
    if (
      ended ||
      broken.has(worker) ||
      worker.removeEventListener === undefined ||
      idle.length >= maxIdle
    ) {
      worker.terminate();
      return;
    }
    let acksLeft = owedAcks + 1;
    const onReset = (event: { data: unknown }) => {
      if (!isCancelledAck(event.data)) {
        return;
      }
      acksLeft -= 1;
      if (acksLeft > 0) {
        return;
      }
      worker.removeEventListener?.("message", onReset);
      if (!resetting.delete(worker)) {
        // A drain or dispose got here first and already terminated it.
        return;
      }
      if (broken.has(worker) || idle.length >= maxIdle) {
        worker.terminate();
        return;
      }
      idle.push(worker);
    };
    resetting.add(worker);
    worker.addEventListener("message", onReset);
    worker.postMessage({ type: "cancel" });
  };

  const factory = async (): Promise<WorkerLike> => {
    const worker = await acquire();
    const listeners = new Map<MessageListener, MessageListener>();
    let leaseEnded = false;
    // FIFO bookkeeping for the release: cancels this lease sent minus acks
    // already received is what the worker still owes at terminate time.
    let cancelsSent = 0;
    let acksSeen = 0;
    const ackMonitor: MessageListener = (event) => {
      if (isCancelledAck(event.data)) {
        acksSeen += 1;
      }
    };
    const canMonitor = worker.removeEventListener !== undefined;
    if (canMonitor) {
      worker.addEventListener("message", ackMonitor);
    }

    const lease: WorkerLike = {
      postMessage(message) {
        if (leaseEnded) {
          return;
        }
        if ((message as { type?: unknown } | null)?.type === "cancel") {
          cancelsSent += 1;
        }
        worker.postMessage(message);
      },
      addEventListener(type, listener) {
        if (leaseEnded) {
          return;
        }
        listeners.set(listener, listener);
        worker.addEventListener(type, listener);
      },
      removeEventListener(type, listener) {
        listeners.delete(listener);
        worker.removeEventListener?.(type, listener);
      },
      terminate() {
        if (leaseEnded) {
          return;
        }
        leaseEnded = true;
        for (const listener of listeners.values()) {
          worker.removeEventListener?.("message", listener);
        }
        listeners.clear();
        if (canMonitor) {
          worker.removeEventListener?.("message", ackMonitor);
        }
        release(worker, Math.max(0, cancelsSent - acksSeen));
      },
    };
    return lease;
  };

  const drain = () => {
    for (const worker of idle.splice(0)) {
      worker.terminate();
    }
    // Workers still awaiting their reset ack die too; their pending
    // `onReset` sees the emptied set and pools nothing.
    for (const worker of resetting) {
      worker.terminate();
    }
    resetting.clear();
  };

  return Object.assign(factory, {
    drain,
    dispose() {
      ended = true;
      drain();
    },
  });
}
