import type { SimulationCompletionReason } from "../engine/compute-next-frame";
import type { SimulationFrameNewStrings } from "../worker/frame-payload";

export type TraceEventKind =
  /** The state the run starts from, at time 0. */
  | "initial"
  /** One or more transitions fired; the frame is the state after them. */
  | "firing"
  /**
   * Nothing fired, but the previous event is far enough back that the
   * continuous evolution needs a fresh anchor. The run's last state is
   * also recorded as a reference event when it is not a firing.
   */
  | "reference";

/**
 * One record of an event-driven run: the state at a point in time, with what
 * a consumer needs to carry it forward to the next event without stepping
 * the engine again.
 */
export type TraceEvent = {
  /** Position in the trace; the initial state is 0. */
  index: number;
  /** Simulation time of the state this event records, in seconds. */
  time: number;
  kind: TraceEventKind;
  /** Transitions that fired at `time`, in net order. Empty unless `kind` is `firing`. */
  firedTransitionIds: readonly string[];
  /**
   * Frame place indices whose tokens the firings consumed or produced. Their
   * tokens cannot be matched to the previous event's, so interpolation
   * towards this event stops at the previous one for them.
   */
  touchedPlaceIndices: Uint32Array;
  /** The state after the event, in the engine frame format. */
  frame: ArrayBuffer;
  /**
   * Per frame place index, the derivative of every token's `real` attributes
   * at `frame`, laid out `tokens × real fields` as the place's differential
   * equation returns it. `null` for a place without dynamics.
   */
  derivatives: readonly (Float64Array | null)[];
  /** String pool entries interned since the previous event, if any. */
  newStrings?: SimulationFrameNewStrings;
  /**
   * Per frame place index, the solver's accumulated local error estimate
   * for the place's continuous state since the run started, in attribute
   * units: the sum over its integration steps of the largest error any
   * token's attribute took in the step. Zero for a place without dynamics
   * or one advanced exactly. Only the adaptive solver records it.
   */
  solverError?: Float64Array;
};

/**
 * Whether an event changes the discrete state: the initial marking or a
 * firing. Reference frames only re-anchor the continuous evolution, so a
 * viewer stepping between events skips them.
 */
export const isDiscreteEvent = (event: Pick<TraceEvent, "kind">): boolean =>
  event.kind !== "reference";

/** What a host sees of a trace without holding its events. */
export type EventTraceSummary = {
  eventCount: number;
  /**
   * Simulation time the trace is complete up to: every event at or before
   * it has been recorded. Moves on without an event when nothing fires.
   */
  coveredTime: number;
  latest: TraceEvent | null;
};

export type EventSimulationCompleteEvent = {
  type: "complete";
  reason: SimulationCompletionReason;
  /** Simulation time the run stopped at. */
  time: number;
};

export type EventSimulationErrorEvent = {
  type: "error";
  message: string;
  itemId: string | null;
};

export type EventSimulationEvent =
  | EventSimulationCompleteEvent
  | EventSimulationErrorEvent;
