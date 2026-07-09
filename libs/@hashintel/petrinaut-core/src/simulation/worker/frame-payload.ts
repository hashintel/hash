import type { EngineFrame } from "../frames/internal-frame";

/**
 * Append-only string pool delta shipped alongside a frame. The worker owns
 * the run's `StringPool`; the main thread rebuilds an accumulated copy by
 * applying deltas in order (`baseId` must equal the copy's current length).
 * A frame's string fields only reference pool IDs below the pool length
 * reached once its payload's delta is applied.
 */
export type SimulationFrameNewStrings = {
  baseId: number;
  values: string[];
};

/**
 * Worker protocol representation for a full frame payload.
 *
 * Time is attached by the run controller, not stored in `EngineFrame`.
 */
export type SimulationFramePayload = {
  time: number;
  frame: EngineFrame;
  /** Pool entries interned since the previous payload, if any. */
  newStrings?: SimulationFrameNewStrings;
};

export function framePayloadFromEngineFrame(
  frame: EngineFrame,
  time: number,
  newStrings?: SimulationFrameNewStrings,
): SimulationFramePayload {
  return newStrings && newStrings.values.length > 0
    ? { time, frame, newStrings }
    : { time, frame };
}
