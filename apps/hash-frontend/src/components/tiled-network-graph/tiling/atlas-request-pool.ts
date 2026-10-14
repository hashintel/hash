/**
 * Bounds how many atlas data-route requests run at once.
 *
 * A viewport descent fans a whole frontier level out in one `Promise.all`, so
 * without a bound a cold viewport fires dozens of requests in the same tick —
 * a burst shape the atlas's per-address rate gate is sized to refuse.
 * The pool turns that burst into a bounded stream: at most {@link
 * ATLAS_DATA_REQUEST_LIMIT} requests in flight, the rest queued.
 *
 * Two lanes, strict priority: a queued `required` request always starts before
 * a queued `speculative` one, whatever order they arrived in.
 *
 * Only the four data routes come through here. The manifest and `current`
 * requests stay unpooled.
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
 * drought never parks the whole pool behind sleeping occupants, and admission
 * is lane-blind — a required load may be riding an in-flight prefetch's
 * promise, so a stricter speculative gate would become a required load's gate
 * (see `takeAtlasRequestToken` for the full argument). Absent budget reports,
 * pacing is free and the pool behaves as before.
 */

import {
  refundAtlasRequestToken,
  takeAtlasRequestToken,
} from "./atlas-backpressure";

/**
 * Concurrent data-route requests; queued beyond this.
 *
 * Sized for HTTP/2: twelve streams cover a typical deep level in one or two
 * waves, while keeping the one burst no budget report has bounded yet — the
 * first fan-out of a session, before any `RateLimit` response has seeded the
 * pacing model — comfortably inside the server's default gate burst.
 *
 * On HTTP/1.1 browsers hold ~6 connections per host, so the excess waits in the browser's own queue.
 */
const ATLAS_DATA_REQUEST_LIMIT = 12;

export type AtlasRequestLane = "required" | "speculative";

interface Waiter {
  readonly start: () => void;
  readonly signal: AbortSignal | undefined;
}

export interface AtlasRequestPool {
  run<T>(
    lane: AtlasRequestLane,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}

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
 * Waits until the pacing model admits one request (see
 * `takeAtlasRequestToken` — admission is lane-blind by design; the lane
 * decides slot priority below, not budget access); each ask is bounded, so a
 * drought is re-checked rather than slept through, and an abort lands
 * between asks.
 */
const paceAtlasRequest = async (
  signal: AbortSignal | undefined,
): Promise<void> => {
  for (;;) {
    const waitMs = takeAtlasRequestToken();
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
      await paceAtlasRequest(signal);
      // The pacing token is spent, but the request has not reached the server
      // yet: an abort landing in the slot queue must give the token back, or
      // a cancelled burst would throttle its successors for budget the server
      // never saw (see `refundAtlasRequestToken`).
      try {
        await acquire(lane, signal);
      } catch (error) {
        refundAtlasRequestToken();
        throw error;
      }
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
