/**
 * Backpressure from the atlas rate limiter.
 *
 * The atlas answers an over-budget caller with `429` and a `Retry-After`
 * naming when the budget readmits it. Required viewport loads already retry
 * with backoff (see `withAtlasRetry` in `fetch-tile.ts`); what must *not*
 * continue is speculation — a prefetch spends exactly the budget the refused
 * required load is waiting on. So every `429` any data route sees lands here
 * (see `requestAtlasOnce`), and the prefetch scheduler asks before
 * speculating (see `getViewportNodes`).
 *
 * The pause is one module-level deadline rather than per-origin state: a
 * budget is per caller on the serving side, one origin is the shipped shape,
 * and a pause's worst cost is a prefetch not taken.
 */

/** Pause on a `429` carrying no readable `Retry-After`, and the floor under one that does. */
const SPECULATION_PAUSE_MIN_MS = 2_000;
/**
 * Ceiling on a single pause. A drained hourly budget can name minutes; honouring
 * it in full is correct, but an unreadable clock or a garbage header must not
 * freeze speculation for a session, so the deadline is bounded.
 */
const SPECULATION_PAUSE_MAX_MS = 5 * 60_000;

let speculationPausedUntil = 0;

/**
 * Records a rate-limited response. `retryAfterMs` is the server's stated wait
 * when the response carried a readable `Retry-After`; the pause is that wait
 * clamped to `[2s, 5min]`. Deadlines only extend — a shorter wait landing
 * during a longer pause does not cut it.
 */
export const noteAtlasRateLimited = (retryAfterMs?: number): void => {
  const pause = Math.min(
    Math.max(retryAfterMs ?? 0, SPECULATION_PAUSE_MIN_MS),
    SPECULATION_PAUSE_MAX_MS,
  );
  speculationPausedUntil = Math.max(speculationPausedUntil, Date.now() + pause);
};

/** Whether speculative prefetching should currently yield to required loads. */
export const isAtlasSpeculationPaused = (): boolean =>
  Date.now() < speculationPausedUntil;

/** Clears the pause; for tests. */
export const resetAtlasBackpressure = (): void => {
  speculationPausedUntil = 0;
};
