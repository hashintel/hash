/**
 * Message types for communication between main thread and simulation worker.
 *
 * @see ./README.md for detailed protocol documentation
 */

import type { SDCPN } from "../../core/types/sdcpn";
import type { SimulationFrame } from "../context";

//
// Main Thread → Worker Messages
//

/**
 * Initialize the simulation with SDCPN definition and configuration.
 * This compiles user code and creates the SimulationInstance in the worker.
 */
export type InitMessage = {
  type: "init";
  /** The SDCPN definition to simulate */
  sdcpn: SDCPN;
  /** Initial token distribution (serialized from Map) */
  initialMarking: Array<[string, { values: Float64Array; count: number }]>;
  /** Parameter values (overrides SDCPN defaults) */
  parameterValues: Record<string, string>;
  /** Random seed for deterministic stochastic behavior */
  seed: number;
  /** Time step for simulation advancement */
  dt: number;
  /** Maximum simulation time (immutable once set). Null means no limit. */
  maxTime: number | null;
  /** Maximum frames the worker can compute ahead before waiting for ack (backpressure) */
  maxFramesAhead?: number;
  /** Number of frames to compute in each batch before checking for messages */
  batchSize?: number;
};

/**
 * Start or resume computing frames.
 */
export type StartMessage = {
  type: "start";
};

/**
 * Pause computation (retains simulation state).
 */
export type PauseMessage = {
  type: "pause";
};

/**
 * Stop and discard the simulation entirely.
 */
export type StopMessage = {
  type: "stop";
};

/**
 * Update backpressure configuration at runtime.
 */
export type SetBackpressureMessage = {
  type: "setBackpressure";
  /** Maximum frames the worker can compute ahead before waiting for ack */
  maxFramesAhead?: number;
  /** Number of frames to compute in each batch before checking for messages */
  batchSize?: number;
};

/**
 * Acknowledge receipt of frames up to a given number.
 * Used for backpressure to prevent worker from computing too far ahead.
 */
export type AckMessage = {
  type: "ack";
  /** The frame number that has been received by main thread */
  frameNumber: number;
};

/**
 * Union of all messages that can be sent from main thread to worker.
 */
export type ToWorkerMessage =
  | InitMessage
  | StartMessage
  | PauseMessage
  | StopMessage
  | SetBackpressureMessage
  | AckMessage;

//
// Worker → Main Thread Messages
//

/**
 * Worker has successfully initialized the simulation.
 */
export type ReadyMessage = {
  type: "ready";
  /** Number of frames in initial state (typically 1) */
  initialFrameCount: number;
};

/**
 * A new frame has been computed.
 */
export type FrameMessage = {
  type: "frame";
  frame: SimulationFrame;
};

/**
 * Multiple frames computed (batch optimization).
 */
export type FramesMessage = {
  type: "frames";
  frames: SimulationFrame[];
};

/**
 * Simulation has completed.
 */
export type CompleteMessage = {
  type: "complete";
  reason: "deadlock" | "maxTime";
  /** Final frame number */
  frameNumber: number;
};

/**
 * An error occurred in the worker.
 */
export type ErrorMessage = {
  type: "error";
  message: string;
  /** ID of the SDCPN item that caused the error (if applicable) */
  itemId: string | null;
};

/**
 * Worker is paused and waiting.
 */
export type PausedMessage = {
  type: "paused";
  /** Current frame number when paused */
  frameNumber: number;
};

/**
 * Union of all messages that can be sent from worker to main thread.
 */
export type ToMainMessage =
  | ReadyMessage
  | FrameMessage
  | FramesMessage
  | CompleteMessage
  | ErrorMessage
  | PausedMessage;
