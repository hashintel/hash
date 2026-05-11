import type { ID } from "../../types/sdcpn";
import type { SimulationFrameState_Transition } from "../api";

/**
 * Internal place layout within an engine frame.
 */
export type EngineFramePlaceState = {
  offset: number;
  count: number;
  dimensions: number;
};

/**
 * Internal frame storage layout used by the stepping engine.
 *
 * This is not a worker protocol or public API type. Public callers should read
 * engine output through `SimulationFrameReader`.
 */
export type EngineFrame = {
  /** Place states with token buffer offsets, keyed by place ID */
  places: Record<ID, EngineFramePlaceState>;
  /** Transition states with firing information, keyed by transition ID */
  transitions: Record<ID, SimulationFrameState_Transition>;
  /**
   * Buffer containing all place values concatenated.
   *
   * Size: sum of (place.dimensions * place.count) for all places.
   *
   * Layout: For each place, its tokens are stored contiguously.
   */
  buffer: Float64Array;
};
