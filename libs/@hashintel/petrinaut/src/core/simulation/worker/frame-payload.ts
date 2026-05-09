import type { ID } from "../../types/sdcpn";
import type { SimulationFrameState_Transition } from "../api";
import type { EngineFrame } from "../frames/internal-frame";

/**
 * Worker protocol representation for a full frame payload.
 *
 * This is intentionally separate from `EngineFrame`: the current v1 payload is
 * structurally similar, but the worker protocol is the compatibility boundary.
 */
export type SimulationFramePayloadPlaceState = {
  offset: number;
  count: number;
  dimensions: number;
};

export type SimulationFramePayload = {
  time: number;
  places: Record<ID, SimulationFramePayloadPlaceState>;
  transitions: Record<ID, SimulationFrameState_Transition>;
  buffer: Float64Array;
};

export function framePayloadFromEngineFrame(
  frame: EngineFrame,
): SimulationFramePayload {
  return {
    time: frame.time,
    places: frame.places,
    transitions: frame.transitions,
    buffer: frame.buffer,
  };
}
