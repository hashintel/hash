/**
 * At most `limit` model requests in flight per process, across every
 * conversation's Harness. A generation's `beforeRequest` hook waits for a
 * slot, first come first served, and the slot frees once that request's
 * response is in (`afterResponse`). Nothing is refused or held outside Pi
 * Durable: the waiting request belongs to a stored run, so a restart that cuts
 * the wait off resumes the run, which waits again.
 *
 * A request can also end without `afterResponse`: an abort or close (the
 * hook context's signal), a deferred response, or a thrown phase. Each
 * Harness's task graph is observed, so a slot is freed as soon as its
 * generation leaves the running `request` phase, and every slot of a Harness
 * is freed when it closes.
 *
 * A run waiting on a browser call holds no slot: its generation is waiting
 * on its tool tasks, between requests.
 */
import {
  defineExtension,
  GenerationTask,
  type Harness,
  hook,
  type TaskId,
} from "@earendil-works/pi-durable";

import type { Context } from "@earendil-works/chord";

/** The name a conversation's agent selects the gate under. */
export const requestSlotsExtensionName = "durable-agents.request-slots";

export type RequestSlotsState = {
  /** Requests holding a slot. */
  readonly inFlight: number;
  /** Requests waiting for one. */
  readonly waiting: number;
};

export const createRequestSlots = (limit: number) => {
  if (!(limit >= 1))
    throw new RangeError(`A request slot limit must be 1 or more: ${limit}.`);
  let inFlight = 0;
  const queue: (() => void)[] = [];

  const grantWaiting = () => {
    while (inFlight < limit) {
      const next = queue.shift();
      if (next === undefined) return;
      next();
    }
  };

  /** One slot, once free; resolves with its release, which is idempotent. Rejects when `signal` aborts first. */
  const acquire = (signal: AbortSignal | undefined) =>
    new Promise<() => void>((resolve, reject) => {
      const grant = () => {
        inFlight += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          inFlight -= 1;
          grantWaiting();
        });
      };
      if (signal?.aborted === true) {
        reject(signal.reason);
        return;
      }
      if (inFlight < limit && queue.length === 0) {
        grant();
        return;
      }
      const onAbort = () => {
        const index = queue.indexOf(entry);
        if (index !== -1) queue.splice(index, 1);
        reject(signal?.reason);
      };
      const entry = () => {
        signal?.removeEventListener("abort", onAbort);
        grant();
      };
      queue.push(entry);
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  /**
   * The gate of one Harness: its extension, to install in that Harness's
   * registry and select in its conversation's agent, and `attach`, once the
   * Harness is open, to free what that Harness's requests hold.
   */
  const gate = () => {
    /** Slots this Harness's generations hold, by task: task IDs are per storage. */
    const held = new Map<TaskId, () => void>();
    let closed = false;

    const release = (taskId: TaskId) => {
      held.get(taskId)?.();
      held.delete(taskId);
    };
    const releaseAll = () => {
      closed = true;
      // Deleting the visited key while iterating a Map is safe.
      for (const taskId of held.keys()) release(taskId);
    };

    const extension = defineExtension({
      name: requestSlotsExtensionName,
      hooks: [
        hook(GenerationTask, {
          beforeRequest: async (_request, api, context) => {
            // A retried attempt that kept its slot does not take a second one.
            if (held.has(api.taskId)) return undefined;
            const releaseSlot = await acquire(context.abortSignal);
            if (closed) {
              releaseSlot();
              return undefined;
            }
            held.set(api.taskId, releaseSlot);
            context.abortSignal?.addEventListener(
              "abort",
              () => release(api.taskId),
              { once: true },
            );
            return undefined;
          },
          afterResponse: (_message, api) => {
            release(api.taskId);
          },
        }),
      ],
    });

    const attach = async (harness: Harness, context: Context) => {
      const observation = await harness.observeTaskGraph(
        {
          advance: (call) => {
            if (call.kind !== "value") return;
            for (const taskId of held.keys()) {
              const node = call.value.tasks[String(taskId)];
              if (
                node?.state.status !== "running" ||
                node.state.phase !== "request"
              )
                release(taskId);
            }
          },
          end: releaseAll,
        },
        context,
      );
      void harness.closed.then(releaseAll, releaseAll);
      return observation;
    };

    return { extension, attach };
  };

  return {
    gate,
    state: (): RequestSlotsState => ({ inFlight, waiting: queue.length }),
  };
};

export type RequestSlots = ReturnType<typeof createRequestSlots>;
