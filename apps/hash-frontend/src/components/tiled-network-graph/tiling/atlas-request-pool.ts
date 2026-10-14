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

import { registerPrincipalScopedReset } from "../../../shared/principal-scoped-state";
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
  /** Rejects the waiting acquisition without starting it; for {@link AtlasRequestPool.flush}. */
  readonly cancel: (error: Error) => void;
  readonly signal: AbortSignal | undefined;
}

export interface AtlasRequestPool {
  run<T>(
    lane: AtlasRequestLane,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
  /**
   * Rejects every request still waiting — budget-paced or slot-queued —
   * without dispatching it; operations already running finish undisturbed.
   */
  flush(reason?: Error): void;
}

const abortError = (signal: AbortSignal | undefined): Error => {
  const reason: unknown = signal?.reason;
  return reason instanceof Error
    ? reason
    : new DOMException("Atlas request aborted while queued", "AbortError");
};

export const createAtlasRequestPool = (
  limit: number = ATLAS_DATA_REQUEST_LIMIT,
): AtlasRequestPool => {
  let active = 0;
  const required: Waiter[] = [];
  const speculative: Waiter[] = [];
  /** Rejection hooks of the budget-paced sleeps in flight; for {@link flush}. */
  const pacing = new Set<(error: Error) => void>();

  /** A `setTimeout` that also settles (rejecting) on abort or a pool flush. */
  const paceSleep = (
    ms: number,
    signal: AbortSignal | undefined,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError(signal));
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Assigned below, once the listeners it detaches exist; the stable
      // hooks added to `pacing` and the abort event close over it.
      let settle: (error?: Error) => void = () => {};
      const cancel = (error: Error): void => {
        settle(error);
      };
      const onAbort = (): void => {
        settle(abortError(signal));
      };
      settle = (error?: Error): void => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        signal?.removeEventListener("abort", onAbort);
        pacing.delete(cancel);
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      };
      pacing.add(cancel);
      timer = setTimeout(() => {
        settle();
      }, ms);
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  /**
   * Waits until the pacing model admits one request (see
   * `takeAtlasRequestToken` — admission is lane-blind by design; the lane
   * decides slot priority below, not budget access); each ask is bounded, so
   * a drought is re-checked rather than slept through, and an abort or a
   * flush lands between asks.
   */
  const paceAtlasRequest = async (
    signal: AbortSignal | undefined,
  ): Promise<void> => {
    for (;;) {
      const waitMs = takeAtlasRequestToken();
      if (waitMs <= 0) {
        return;
      }
      await paceSleep(waitMs, signal);
    }
  };

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
        cancel: (error) => {
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
      });
    });

  const release = (): void => {
    active -= 1;
    admit();
  };

  return {
    run: async (lane, operation, signal) => {
      // Deliberately lane-blind: a required load may be riding an in-flight
      // prefetch's promise (see `TileCache.load`), so any pacing disadvantage
      // given to speculative dispatch here would be inherited by required
      // traffic that holds no abort signal — the stall `takeAtlasRequestToken`
      // documents. The lane buys slot priority below instead; what bounds
      // speculative token spending is issuance, where batches are gated and
      // cancelled per descent level under backpressure, so at most one
      // already-issued batch competes, for at most one level's round trip.
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
    flush: (
      reason = new DOMException(
        "Atlas request superseded before dispatch",
        "AbortError",
      ),
    ) => {
      for (const cancel of [...pacing]) {
        cancel(reason);
      }
      for (const waiter of [...required.splice(0), ...speculative.splice(0)]) {
        if (waiter.signal?.aborted !== true) {
          waiter.cancel(reason);
        }
      }
    },
  };
};

/** The shared pool every atlas data route runs under. */
export const atlasRequestPool: AtlasRequestPool = createAtlasRequestPool();

/**
 * Flushes the shared pool when the authenticated principal changes.
 *
 * Everything still waiting was enqueued for the previous principal's
 * viewport: its consumers are discarded by the same transition, so
 * dispatching it would spend the successor's budget and slots on requests
 * nothing can attribute — and the slot-queued entries already spent pacing
 * tokens that the backpressure reset's cleared models make unrefundable,
 * which the flush path's refund then correctly no-ops. Requests already on
 * the wire are left to finish: the transport's incarnation guards refuse
 * their publications, and cutting a socket frees nothing the pool controls.
 *
 * Registered at module load, so the pool cannot be imported without its
 * reset (see `shared/principal-scoped-state.ts` for the placement contract).
 */
registerPrincipalScopedReset(() => {
  atlasRequestPool.flush();
});
