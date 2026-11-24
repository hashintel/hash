import type { WorkerFactoryLike } from "../environment/environment";
import type { HirParameterValues } from "../hir-runtime";
import type { Color, Place, TokenRecord } from "../types/sdcpn";

export type SimulationState =
  | "Initializing"
  | "Ready"
  | "Running"
  | "Paused"
  | "Complete"
  | "Error";

/**
 * Default RNG seed shared by interactive simulation and optimization runs, so
 * a simulation played in the editor reproduces an optimization trial given the
 * same model, scenario parameter values, dt, and max time.
 */
export const PETRINAUT_DEFAULT_SEED = 1234;

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
 * One token attribute value in an initial marking. In addition to runtime
 * token values, `uuid` attributes may be supplied as canonical UUID strings
 * (the JSON-serializable at-rest form) — the simulator coerces both. Strings
 * are literal values for `string` attributes.
 */
export type InitialTokenAttributeValue = number | boolean | bigint | string;

/**
 * Initial token distribution for starting a simulation.
 *
 * This is intentionally JSON-serializable (supply `uuid` attributes as
 * strings, not bigints, when serializing). The simulator is responsible for
 * converting it into its internal packed frame representation.
 *
 * - Uncolored places use a token count.
 * - Colored places use one record per token, keyed by color element name.
 */
export type InitialPlaceMarking =
  | number
  | Record<string, InitialTokenAttributeValue>[];
export type InitialMarking = Record<string, InitialPlaceMarking>;

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

/**
 * Raw (buffer-level) view over one frame's packed token data, consumed by
 * HIR-compiled expression metrics. Internal: the arrays alias the frame's
 * live buffers and are only valid while the reader itself is.
 */
export type SimulationFrameRawView = {
  /** Shared views over the frame's token byte region (format v2). */
  f64: Float64Array;
  u64: BigUint64Array;
  u8: Uint8Array;
  /** Dense per-place token counts, indexed by frame place index. */
  placeCounts: Uint32Array;
  /** Dense per-place byte offsets into the token region. */
  placeOffsets: Uint32Array;
  /** Place id → frame place index (stable across frames of one run). */
  placeIndexById: ReadonlyMap<string, number>;
  /** Resolves interned `string` token attributes. */
  stringPool?: { get(id: number): string };
  /**
   * Resolved net parameter values for the run this frame belongs to, bound to
   * ambient `parameters.<name>` reads in expression metrics. Monte-Carlo runs
   * can override parameters per run, so this is frame-source-specific; readers
   * that omit it fall back to the evaluator's construction-time values.
   */
  parameterValues?: HirParameterValues;
};

export interface SimulationFrameReader {
  /** Frame index in the simulation history. */
  readonly number: number;
  /** Simulation time for this frame, in seconds. */
  readonly time: number;

  getPlaceTokenCount(placeId: string): number;
  /**
   * Raw buffer access for compiled expression metrics. Optional — readers
   * over non-buffer sources may omit it, in which case expression metrics
   * cannot evaluate against their frames.
   */
  getRawView?(): SimulationFrameRawView;
  /** Typed token records for a coloured place; `[]` for uncoloured places. */
  getPlaceTokens(place: Place, color?: Color | null): TokenRecord[];
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
