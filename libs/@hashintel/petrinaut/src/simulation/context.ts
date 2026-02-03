import { createContext } from "react";

import type { ID, Transition } from "../core/types/sdcpn";

/**
 * Current state of the simulation lifecycle.
 */
export type SimulationState =
  | "NotRun"
  | "Running"
  | "Complete"
  | "Error"
  | "Paused";

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

/**
 * The combined simulation context containing both state and actions.
 *
 * Note: The full SimulationInstance is not exposed. Instead, use `getFrame()`
 * to access individual frame data. This encapsulation supports the WebWorker
 * architecture where frames are computed off the main thread.
 */
export type SimulationContextValue = {
  // State values
  /**
   * Current lifecycle state of the simulation.
   */
  state: SimulationState;
  /**
   * Error message if state is "Error".
   */
  error: string | null;
  /**
   * ID of the SDCPN item that caused the error, if applicable.
   */
  errorItemId: string | null;
  /**
   * Current parameter values (string representation for UI binding).
   */
  parameterValues: Record<string, string>;
  /**
   * Initial token distribution for each place.
   */
  initialMarking: InitialMarking;
  /**
   * Time step for simulation advancement.
   */
  dt: number;
  /**
   * Maximum simulation time in seconds.
   * When the simulation reaches this time, it will be paused.
   * If null, the simulation runs until no transitions are enabled.
   */
  maxTime: number | null;
  /**
   * Total number of computed frames available.
   */
  totalFrames: number;

  // Frame access
  /**
   * Get a specific frame by index.
   * Returns null if the index is out of bounds or no simulation exists.
   *
   * This is the primary way to access frame data. The full frame history
   * is kept internal to the provider for memory management.
   *
   * @param frameIndex - The index of the frame to retrieve (0-based)
   * @returns Promise resolving to the frame data or null
   */
  getFrame: (frameIndex: number) => Promise<SimulationFrame | null>;

  /**
   * Get all computed frames.
   * Returns an empty array if no simulation exists.
   *
   * Note: For large simulations, this may return a large array.
   * Consider using getFrame() for single-frame access when possible.
   *
   * @returns Promise resolving to array of all frames
   */
  getAllFrames: () => Promise<SimulationFrame[]>;

  // Actions
  setInitialMarking: (
    placeId: string,
    marking: { values: Float64Array; count: number },
  ) => void;
  setParameterValue: (parameterId: string, value: string) => void;
  setDt: (dt: number) => void;
  /**
   * Set the maximum simulation time in seconds.
   * Pass null to disable the time limit.
   */
  setMaxTime: (maxTime: number | null) => void;
  /**
   * Initialize the simulation with the given parameters.
   * Returns a Promise that resolves when initialization is complete (ready state)
   * or rejects if an error occurs during initialization.
   */
  initialize: (params: {
    seed: number;
    dt: number;
    maxFramesAhead?: number;
    batchSize?: number;
  }) => Promise<void>;
  run: () => void;
  pause: () => void;
  reset: () => void;
  /**
   * Update backpressure configuration at runtime.
   * Called by PlaybackProvider when playMode changes.
   */
  setBackpressure: (params: {
    maxFramesAhead?: number;
    batchSize?: number;
  }) => void;
  /**
   * Acknowledge receipt of frames up to the given frame number.
   * Used for backpressure control - the worker will pause computation
   * when it gets too far ahead of acknowledged frames.
   *
   * This should be called by PlaybackProvider based on playMode:
   * - viewOnly: never call ack
   * - computeBuffer: call ack when in the buffer zone (near end of available frames)
   * - computeMax: call ack every time new frames arrive
   */
  ack: (frameNumber: number) => void;
};

const DEFAULT_CONTEXT_VALUE: SimulationContextValue = {
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: new Map(),
  dt: 0.01,
  maxTime: null,
  totalFrames: 0,
  getFrame: () => Promise.resolve(null),
  getAllFrames: () => Promise.resolve([]),
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setDt: () => {},
  setMaxTime: () => {},
  initialize: () => Promise.resolve(),
  run: () => {},
  pause: () => {},
  reset: () => {},
  setBackpressure: () => {},
  ack: () => {},
};

export const SimulationContext = createContext<SimulationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
