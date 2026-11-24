/**
 * Append-only string pool delta shipped alongside a frame. The worker owns
 * the run's `StringPool`; the main thread rebuilds an accumulated copy by
 * applying deltas in order (`baseId` must equal the copy's current length).
 * A frame's string fields only reference pool IDs below the pool length
 * reached once the delta shipped with it is applied.
 */
export type SimulationFrameNewStrings = {
  baseId: number;
  values: string[];
};
