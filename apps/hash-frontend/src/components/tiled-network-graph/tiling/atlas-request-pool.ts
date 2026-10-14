/**
 * Bounds how many atlas data-route requests run at once.
 *
 * A viewport descent fans a whole frontier level out in one `Promise.all`, so
 * without a bound a cold viewport fires dozens of requests in the same tick —
 * a burst shape the atlas's per-address rate gate is exactly sized to refuse.
 * The pool turns that burst into a bounded stream: at most {@link
 * ATLAS_DATA_REQUEST_LIMIT} requests in flight, the rest queued.
 *
 * Two lanes, strict priority: a queued `required` request always starts before
 * a queued `speculative` one, whatever order they arrived in — speculation is
 * the first traffic to yield. Within a lane, FIFO. The lane is derived from
 * the request's network priority hint (a prefetch already states `"low"`; see
 * `TileFetchControls.priority`), so no call site names it twice.
 *
 * Only the four data routes come through here. The manifest and `current`
 * requests stay unpooled: they are rare, every pooled request may depend on
 * one (the `401` renewal path), and a bootstrap queued behind the tile burst
 * it unblocks would deadlock the lot.
 *
 * One slot spans one HTTP attempt, not one logical request: `requestAtlas`
 * acquires inside its retry loop, so a backoff sleep never holds a slot.
 *
 * Concurrency alone does not bound *rate* — six slots over fast local
 * responses sustain hundreds of requests a second against a budget that
 * refills tens — so dispatch is also paced by the server's own reported
 * budgets: before taking a slot, a request spends a token from the pacing
 * model (see `takeAtlasRequestToken` in `atlas-backpressure.ts`), waiting out
 * a dry budget in the client's queue instead of sending a request the server
 * would refuse. Pacing runs *before* the slot is held, so a long budget
 * drought never parks the whole pool behind sleeping occupants. Absent budget
 * reports, pacing is free and the pool behaves as before.
 */

import { takeAtlasRequestToken } from "./atlas-backpressure";

/** Concurrent data-route requests; queued beyond this. */
const ATLAS_DATA_REQUEST_LIMIT = 6;

/** Which queue a request waits in; `required` always starts first. */
export type AtlasRequestLane = "required" | "speculative";

interface Waiter {
  readonly start: () => void;
  readonly signal: AbortSignal | undefined;
}

/** Runs operations under one shared concurrency bound; see the module doc. */
export interface AtlasRequestPool {
  /**
   * Runs `operation` once a slot is free, releasing the slot when it settles.
   * An abort while queued rejects with the signal's reason and never starts
   * the operation; an abort while running is the operation's own to observe.
   */
  run<T>(
    lane: AtlasRequestLane,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}

/** The abort's reason as an `Error`, for rejecting a queued acquisition. */
const abortError = (signal: AbortSignal | undefined): Error => {
  const reason: unknown = signal?.reason;
  return reason instanceof Error
    ? reason
    : new DOMException("Atlas request aborted while queued", "AbortError");
};

/** A `setTimeout` that also settles (rejecting) the moment `signal` aborts. */
const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      reject(abortError(signal));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Waits until the pacing model admits one `lane` request (see
 * `takeAtlasRequestToken`); each ask is bounded, so a drought is re-checked
 * rather than slept through, and an abort lands between asks.
 */
const paceAtlasRequest = async (
  lane: AtlasRequestLane,
  signal: AbortSignal | undefined,
): Promise<void> => {
  for (;;) {
    const waitMs = takeAtlasRequestToken(lane);
    if (waitMs <= 0) {
      return;
    }
    await sleep(waitMs, signal);
  }
};

export const createAtlasRequestPool = (
  limit: number = ATLAS_DATA_REQUEST_LIMIT,
): AtlasRequestPool => {
  let active = 0;
  const required: Waiter[] = [];
  const speculative: Waiter[] = [];

  const admit = (): void => {
    while (active < limit) {
      const waiter = required.shift() ?? speculative.shift();
      if (waiter === undefined) {
        return;
      }
      // An aborted waiter has already rejected; its queue entry is just a husk.
      if (waiter.signal?.aborted) {
        continue;
      }
      active += 1;
      waiter.start();
    }
  };

  const acquire = (
    lane: AtlasRequestLane,
    signal: AbortSignal | undefined,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError(signal));
        return;
      }
      if (active < limit) {
        active += 1;
        resolve();
        return;
      }
      const onAbort = (): void => {
        reject(abortError(signal));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const queue = lane === "required" ? required : speculative;
      queue.push({
        signal,
        start: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
      });
    });

  const release = (): void => {
    active -= 1;
    admit();
  };

  return {
    run: async (lane, operation, signal) => {
      await paceAtlasRequest(lane, signal);
      await acquire(lane, signal);
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
};

/** The shared pool every atlas data route runs under. */
export const atlasRequestPool: AtlasRequestPool = createAtlasRequestPool();
