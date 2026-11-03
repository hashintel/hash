/**
 * When the worker's pending steps go to the host.
 *
 * A batch flushes once it holds enough steps to be worth a message, when a
 * burst of events fills it, when the run stops, and otherwise on a fixed
 * interval. The interval is the point: while the worker merely keeps up with
 * the demand, which rises with every animation frame, it would otherwise
 * post a few steps per frame, and every post makes the host's stores settle
 * and its consumers render.
 */
export type FlushInput = {
  stepsPending: number;
  eventsPending: number;
  msSinceFlush: number;
  stopping: boolean;
};

/** Steps per message at most: 0.2 s of simulated time at the default step. */
export const FLUSH_STEPS = 2_000;
/** Events per message at most, so a burst of firings streams. */
export const FLUSH_EVENTS = 256;
/** How often the host hears from a worker that is keeping up. */
export const FLUSH_INTERVAL_MS = 100;

export const shouldFlush = ({
  stepsPending,
  eventsPending,
  msSinceFlush,
  stopping,
}: FlushInput): boolean =>
  stopping ||
  stepsPending >= FLUSH_STEPS ||
  eventsPending >= FLUSH_EVENTS ||
  (stepsPending > 0 && msSinceFlush >= FLUSH_INTERVAL_MS);
