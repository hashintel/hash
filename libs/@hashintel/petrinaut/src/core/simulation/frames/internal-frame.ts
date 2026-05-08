import type { ID, Transition } from "../../types/sdcpn";
import type { SimulationFrameState_Transition } from "../api";

/**
 * Internal place layout within a simulation frame.
 */
export type SimulationFrameState_Place = {
  offset: number;
  count: number;
  dimensions: number;
};

/**
 * Internal frame storage layout exchanged with the worker.
 *
 * Public callers should read this through `SimulationFrameReader`.
 */
export type SimulationFrame = {
  /** Simulation time at this frame */
  time: number;
  /** Place states with token buffer offsets, keyed by place ID */
  places: Record<ID, SimulationFrameState_Place>;
  /** Transition states with firing information, keyed by transition ID */
  transitions: Record<
    ID,
    SimulationFrameState_Transition & { instance: Transition }
  >;
  /**
   * Buffer containing all place values concatenated.
   *
   * Size: sum of (place.dimensions * place.count) for all places.
   *
   * Layout: For each place, its tokens are stored contiguously.
   */
  buffer: Float64Array;
};
