import type { AbortSignalLike } from "../environment";
import type { PetrinautOptimizationEvent } from "../optimization";

type WithoutSeq<TEvent> = TEvent extends unknown ? Omit<TEvent, "seq"> : never;

/** An optimization event before the log stamps its sequence number. */
export type OptimizationRunLogEvent = WithoutSeq<PetrinautOptimizationEvent>;

/**
 * One run's events, in segments: each segment begins with `started` and ends
 * with a terminal `complete`/`error`, and a study kept in memory may begin
 * another segment when it is extended.
 */
export type OptimizationRunLog = {
  readonly events: readonly PetrinautOptimizationEvent[];
  /** True while the latest event is terminal, so a replay past it ends at once. */
  readonly settled: boolean;
  /**
   * Stamps the next dense `seq` (from 1) and stores the event. Once settled,
   * only a `started` event may follow.
   */
  append(event: OptimizationRunLogEvent): PetrinautOptimizationEvent;
  subscribe(listener: (event: PetrinautOptimizationEvent) => void): () => void;
  /**
   * Yields the stored events with `seq` greater than `cursor`, then tails live
   * events, and ends at the first terminal event after the cursor. Aborting
   * the signal ends the iteration with an `AbortError`.
   */
  replay(options?: {
    cursor?: number;
    signal?: AbortSignalLike;
  }): AsyncIterable<PetrinautOptimizationEvent>;
};

const isTerminalEvent = (event: PetrinautOptimizationEvent): boolean =>
  event.type === "complete" || event.type === "error";

const createAbortError = (): Error => {
  const error = new Error("optimization run attachment aborted");
  error.name = "AbortError";
  return error;
};

export const createOptimizationRunLog = (): OptimizationRunLog => {
  const events: PetrinautOptimizationEvent[] = [];
  const listeners = new Set<(event: PetrinautOptimizationEvent) => void>();

  const isSettled = (): boolean => {
    const latest = events.at(-1);
    return latest !== undefined && isTerminalEvent(latest);
  };

  const subscribe = (
    listener: (event: PetrinautOptimizationEvent) => void,
  ): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const waitForNextEvent = (signal?: AbortSignalLike): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let unsubscribe = (): void => {};
      const onAbort = (): void => {
        unsubscribe();
        reject(createAbortError());
      };
      unsubscribe = subscribe(() => {
        unsubscribe();
        signal?.removeEventListener("abort", onAbort);
        resolve();
      });
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  return {
    get events() {
      return events;
    },
    get settled() {
      return isSettled();
    },
    append(event) {
      if (isSettled() && event.type !== "started") {
        throw new Error(
          "a settled optimization run log accepts only a started event",
        );
      }
      const stamped = { ...event, seq: events.length + 1 };
      events.push(stamped);
      for (const listener of listeners) {
        listener(stamped);
      }
      return stamped;
    },
    subscribe,
    async *replay(options) {
      const signal = options?.signal;
      // Sequence numbers are dense from 1, so the first event past the cursor
      // sits at index `cursor`.
      let index = Math.max(0, Math.min(options?.cursor ?? 0, events.length));
      for (;;) {
        if (signal?.aborted) {
          throw createAbortError();
        }
        const event = events[index];
        if (event) {
          index++;
          yield event;
          if (isTerminalEvent(event)) {
            return;
          }
          continue;
        }
        if (isSettled()) {
          return;
        }
        await waitForNextEvent(signal);
      }
    },
  };
};
