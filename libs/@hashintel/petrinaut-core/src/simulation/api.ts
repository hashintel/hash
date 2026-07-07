import type { AbortSignalLike, WorkerFactoryLike } from "../environment";
import type { PetrinautExtensionSettings } from "../extensions";
import type { EventStream } from "../instance";
import type { ReadableStore } from "../store";
import type { Place, SDCPN, TokenRecord } from "../types/sdcpn";

export type SimulationState =
  | "Initializing"
  | "Ready"
  | "Running"
  | "Paused"
  | "Complete"
  | "Error";

export type BackpressureConfig = {
  /** Maximum frames the worker can compute ahead before waiting for ack. */
  maxFramesAhead?: number;
  /** Number of frames to compute in each batch before checking for messages. */
  batchSize?: number;
};

export interface SimulationTransport {
  /** Send a message to the engine. May queue if the transport is not yet ready. */
  send(message: unknown): void;
  /** Subscribe to messages from the engine. Returns an unsubscribe function. */
  onMessage(listener: (message: unknown) => void): () => void;
  /** Tear down the underlying worker / runtime. Idempotent. */
  terminate(): void;
}

export type WorkerFactory = WorkerFactoryLike;

/**
 * Initial token distribution for starting a simulation.
 *
 * This is intentionally JSON-serializable. The simulator is responsible for
 * converting it into its internal packed frame representation.
 *
 * - Uncolored places use a token count.
 * - Colored places use one record per token, keyed by color element name.
 */
export type InitialPlaceMarking = number | TokenRecord[];
export type InitialMarking = Record<string, InitialPlaceMarking>;

/**
 * Common per-run config shared by both transport modes. The simulation runs
 * against the {@link sdcpn} snapshot and never reads it again, so subsequent
 * mutations to the source document don't affect a running simulation.
 */
export type SimulationConfig = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  /** Maximum simulation time. Null = no limit. */
  maxTime: number | null;
  backpressure?: BackpressureConfig;
  /** Optional cancellation. Aborting tears down the simulation. */
  signal?: AbortSignalLike;
};

/**
 * Top-level config for `createSimulation`. Provide exactly one of:
 *
 * - `createWorker`: a worker-like factory; the function builds a transport for you.
 * - `transport`: a pre-built {@link SimulationTransport}; ownership transfers
 *   to the simulation (it will be terminated on `simulation.dispose()`).
 */
export type CreateSimulationConfig = SimulationConfig &
  (
    | { createWorker: WorkerFactory; transport?: never }
    | { transport: SimulationTransport; createWorker?: never }
  );

/**
 * Simplified view of a simulation frame for higher-level consumers.
 * Provides easy access to place states without internal details.
 */
export type SimulationFrameState = {
  /** Frame index in the simulation history */
  number: number;
  /** Place states indexed by place ID */
  places: {
    [placeId: string]:
      | {
          /** Number of tokens in the place at the time of the frame. */
          tokenCount: number;
        }
      | undefined;
  };
};

export interface SimulationFrameReader {
  /** Frame index in the simulation history. */
  readonly number: number;
  /** Simulation time for this frame, in seconds. */
  readonly time: number;

  getPlaceTokenCount(placeId: string): number;
  /** Typed token records for a coloured place; `[]` for uncoloured places. */
  getPlaceTokens(place: Place): TokenRecord[];
  getTransitionState(transitionId: string): {
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
  } | null;
  toFrameState(): SimulationFrameState;
}

export type SimulationCompleteEvent = {
  type: "complete";
  reason: "deadlock" | "maxTime";
  frameNumber: number;
};

export type SimulationErrorEvent = {
  type: "error";
  message: string;
  itemId: string | null;
};

export type SimulationEvent = SimulationCompleteEvent | SimulationErrorEvent;

export type SimulationFrameSummary = {
  count: number;
  latest: SimulationFrameReader | null;
};

export interface Simulation {
  readonly status: ReadableStore<SimulationState>;
  readonly frames: ReadableStore<SimulationFrameSummary>;
  readonly events: EventStream<SimulationEvent>;

  run(this: void): void;
  pause(this: void): void;
  reset(this: void): void;
  ack(this: void, frameNumber: number): void;
  setBackpressure(this: void, cfg: BackpressureConfig): void;
  getFrame(this: void, index: number): SimulationFrameReader | null;

  dispose(this: void): void;
}
