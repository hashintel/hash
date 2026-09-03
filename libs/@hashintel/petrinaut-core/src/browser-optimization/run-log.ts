import type { AbortSignalLike } from "../environment";
import type { PetrinautOptimizationEvent } from "../optimization";

type WithoutSeq<TEvent> = TEvent extends unknown ? Omit<TEvent, "seq"> : never;

/** An optimization event before the log stamps its sequence number. */
export type OptimizationRunLogEvent = WithoutSeq<PetrinautOptimizationEvent>;

export type OptimizationRunLog = {
  readonly events: readonly PetrinautOptimizationEvent[];
  /** True once a terminal `complete`/`error` event was appended. */
  readonly closed: boolean;
  /** Stamps the next dense `seq` (from 1) and stores the event. Throws once closed. */
  append(event: OptimizationRunLogEvent): PetrinautOptimizationEvent;
  subscribe(listener: (event: PetrinautOptimizationEvent) => void): () => void;
  /**
   * Yields the stored events with `seq` greater than `cursor`, then tails live
   * events until the terminal one. Aborting the signal ends the iteration with
   * an `AbortError`.
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
  let closed = false;

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
    get closed() {
      return closed;
    },
    append(event) {
      if (closed) {
        throw new Error("optimization run log is closed");
      }
      const stamped = { ...event, seq: events.length + 1 };
      events.push(stamped);
      if (isTerminalEvent(stamped)) {
        closed = true;
      }
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
        if (closed) {
          return;
        }
        await waitForNextEvent(signal);
      }
    },
  };
};
