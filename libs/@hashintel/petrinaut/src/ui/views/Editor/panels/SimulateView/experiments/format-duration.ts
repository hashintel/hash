/**
 * Formats a wall-clock duration for the experiment summary.
 *
 * Deliberately not the same as `formatElapsedTime` in the AI assistant's
 * reasoning card, which floors to whole seconds. Experiment durations span five
 * orders of magnitude — a GPU-backed net can finish in single-digit
 * milliseconds while a large CPU experiment runs for minutes — and flooring
 * would render the fast end as a useless "0s" precisely where the number is
 * most interesting.
 *
 * Precision therefore tracks magnitude: three significant figures near the
 * bottom of the range, whole units near the top, where a tenth of a second is
 * noise.
 */

/*
 * Each unit switches over at the point where *rounding* would otherwise carry
 * into the next one. Comparing against the raw value instead would let 59,999.9
 * take the seconds branch and render "60.0s", and 999.6 render "1000ms".
 */
/** Above this, rounding to whole milliseconds reaches 1,000. */
const MAX_MILLISECOND_INPUT = 999.5;
/** Above this, rounding to hundredths of a second reaches 10. */
const MAX_CENTISECOND_INPUT = 9_995;
/** Above this, rounding to tenths of a second reaches 60. */
const MAX_DECISECOND_INPUT = 59_950;
/** Above this, rounding to whole seconds reaches an hour. */
const MAX_SECOND_INPUT = 3_599_500;

export function formatDurationMs(milliseconds: number): string {
  const clamped = Math.max(0, milliseconds);

  if (clamped < MAX_MILLISECOND_INPUT) {
    return `${Math.round(clamped)}ms`;
  }

  const seconds = clamped / 1_000;

  if (clamped < MAX_CENTISECOND_INPUT) {
    return `${seconds.toFixed(2)}s`;
  }
  if (clamped < MAX_DECISECOND_INPUT) {
    return `${seconds.toFixed(1)}s`;
  }

  const wholeSeconds = Math.round(seconds);
  const totalMinutes = Math.floor(wholeSeconds / 60);

  if (clamped < MAX_SECOND_INPUT) {
    return `${totalMinutes}m ${String(wholeSeconds % 60).padStart(2, "0")}s`;
  }

  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}
