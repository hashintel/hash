/**
 * A worker factory that pools workers between experiments instead of
 * terminating them.
 *
 * A fresh worker re-fetches and re-evaluates the engine module and re-receives
 * the compiled model before it can simulate, and a sweep instantiates a batch
 * per ladder rung and per surface chunk. The protocol is re-initializable:
 * `init` rebuilds the simulator and `cancel` discards it, so a finished or
 * cancelled worker can serve the next experiment. Callers see the plain
 * `WorkerFactory` contract; `terminate()` on a lease detaches the lease's
 * listeners, posts `cancel` and returns the worker to an idle pool.
 *
 * A worker re-enters the pool only once every `cancelled` ack it owes has
 * arrived: an ack landing after the next lease attached its listeners would
 * read as that lease's own shard settling. Acks are FIFO and every `cancel`
 * is answered, so a lease counts cancels out and acks in, and the release
 * waits for the difference plus the reset's own ack.
 */
import type { WorkerLike } from "../../../environment";
import type { WorkerFactory } from "../../api";
import type {
  MonteCarloCancelMessage,
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
} from "../worker/messages";

type MonteCarloWorker = WorkerLike<
  MonteCarloToWorkerMessage,
  MonteCarloToMainMessage
>;

type MessageListener = (event: { data: MonteCarloToMainMessage }) => void;

export type ReusableWorkerFactory = (() => Promise<MonteCarloWorker>) & {
  /** Terminates every idle or resetting worker; leases in flight are unaffected. */
  drain(): void;
  /**
   * Drains and shuts the pool: a worker released afterwards is terminated
   * instead of pooled (a late reset ack pools nothing), and a new lease gets
   * a fresh, unpooled worker.
   */
  dispose(): void;
};

const cancel: MonteCarloCancelMessage = { type: "cancel" };

export const createReusableWorkerFactory = (
  createWorker: WorkerFactory,
  { maxIdle = 8 }: { maxIdle?: number } = {},
): ReusableWorkerFactory => {
  const idle: MonteCarloWorker[] = [];
  /** `cancel` posted, its final `cancelled` ack not yet seen. */
  const resetting = new Set<MonteCarloWorker>();
  const broken = new WeakSet<MonteCarloWorker>();
  let ended = false;

  const acquire = async (): Promise<MonteCarloWorker> => {
    const pooled = idle.pop();
    if (pooled) {
      return pooled;
    }
    // A host's factory is typed for any protocol; the pool's `cancel` /
    // `cancelled` handshake assumes the Monte Carlo one.
    const worker = (await createWorker()) as MonteCarloWorker;
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
   * owes: `owedAcks` from the ending lease, plus the reset's own.
   */
  const release = (worker: MonteCarloWorker, owedAcks: number): void => {
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
    const onReset: MessageListener = (event) => {
      if (event.data.type !== "cancelled") {
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
    worker.postMessage(cancel);
  };

  const factory = async (): Promise<MonteCarloWorker> => {
    const worker = await acquire();
    const listeners = new Set<MessageListener>();
    let leaseEnded = false;
    let cancelsSent = 0;
    let acksSeen = 0;
    const ackMonitor: MessageListener = (event) => {
      if (event.data.type === "cancelled") {
        acksSeen += 1;
      }
    };
    const canMonitor = worker.removeEventListener !== undefined;
    if (canMonitor) {
      worker.addEventListener("message", ackMonitor);
    }

    const lease: MonteCarloWorker = {
      postMessage(message) {
        if (leaseEnded) {
          return;
        }
        if (message.type === "cancel") {
          cancelsSent += 1;
        }
        worker.postMessage(message);
      },
      addEventListener(type, listener) {
        if (leaseEnded) {
          return;
        }
        listeners.add(listener);
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
        for (const listener of listeners) {
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
    // A pending `onReset` sees the emptied set and pools nothing.
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
};
