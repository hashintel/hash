import type { ID, Transition } from "../types/sdcpn";

/**
 * State of a transition within a simulation frame.
 *
 * Contains timing information and firing counts for tracking transition behavior
 * during simulation execution.
 */
export type SimulationFrameState_Transition = {
  /**
   * Time elapsed since this transition last fired, in milliseconds.
   * Resets to 0 when the transition fires.
   */
  timeSinceLastFiringMs: number;
  /**
   * Whether this transition fired in this specific frame.
   * True only during the frame when the firing occurred.
   */
  firedInThisFrame: boolean;
  /**
   * Total cumulative count of times this transition has fired
   * since the start of the simulation (frame 0).
   */
  firingCount: number;
};

/**
 * State of a place within a simulation frame.
 */
export type SimulationFrameState_Place = {
  offset: number;
  count: number;
  dimensions: number;
};

/**
 * A single frame (snapshot) of the simulation state at a point in time.
 * Contains the complete token distribution and transition states.
 *
 * All properties are serializable (no Map types) to support transfer
 * between WebWorker and Main Thread via structured clone.
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
   *
   * Access to a place's token values can be done via the offset and count in the `places` record.
   */
  buffer: Float64Array;
};

/**
 * Simplified view of a simulation frame for UI consumption.
 * Provides easy access to place and transition states without internal details.
 */
export type SimulationFrameState = {
  /** Frame index in the simulation history */
  number: number;
  /** Simulation time at this frame */
  time: number;
  /** Place states indexed by place ID */
  places: {
    [placeId: string]:
      | {
          /** Number of tokens in the place at the time of the frame. */
          tokenCount: number;
        }
      | undefined;
  };
  /** Transition states indexed by transition ID */
  transitions: {
    [transitionId: string]: SimulationFrameState_Transition | undefined;
  };
};

/**
 * Initial token distribution for starting a simulation.
 * Maps place IDs to their initial token values and counts.
 */
export type InitialMarking = Map<
  string,
  { values: Float64Array; count: number }
>;
