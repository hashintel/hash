import type { EngineFrame } from "../frames/internal-frame";

/**
 * Worker protocol representation for a full frame payload.
 *
 * Time is attached by the run controller, not stored in `EngineFrame`.
 */
export type SimulationFramePayload = {
  time: number;
  frame: EngineFrame;
};

export function framePayloadFromEngineFrame(
  frame: EngineFrame,
  time: number,
): SimulationFramePayload {
  return {
    time,
    frame,
  };
}
