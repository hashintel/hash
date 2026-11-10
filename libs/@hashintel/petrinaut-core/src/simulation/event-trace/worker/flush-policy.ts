/**
 * When the worker's pending advances go to the host.
 *
 * A batch flushes once it holds enough advances to be worth a message, when
 * a burst of events fills it, when the run stops, and otherwise on a fixed
 * interval. The interval is the point: while the worker merely keeps up with
 * the demand, which rises with every animation frame, it would otherwise
 * post a few advances per frame, and every post makes the host's stores
 * settle and its consumers render.
 */
export type FlushInput = {
  advancesPending: number;
  eventsPending: number;
  msSinceFlush: number;
  stopping: boolean;
};

/** Advances per message at most. */
export const FLUSH_ADVANCES = 2_000;
/** Events per message at most, so a burst of firings streams. */
export const FLUSH_EVENTS = 256;
/** How often the host hears from a worker that is keeping up. */
export const FLUSH_INTERVAL_MS = 100;
/**
 * How long the worker computes before it looks at its messages again, so a
 * pause or a new demand is not kept waiting by a long stretch of advances.
 */
export const COMPUTE_SLICE_MS = 12;

export const shouldFlush = ({
  advancesPending,
  eventsPending,
  msSinceFlush,
  stopping,
}: FlushInput): boolean =>
  stopping ||
  advancesPending >= FLUSH_ADVANCES ||
  eventsPending >= FLUSH_EVENTS ||
  (advancesPending > 0 && msSinceFlush >= FLUSH_INTERVAL_MS);
