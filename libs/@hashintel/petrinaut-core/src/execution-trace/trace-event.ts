import type { SimulationFrameNewStrings } from "../simulation/frames/frame-payload";

export type TraceEventKind =
  /** The state the execution starts from. */
  | "initial"
  /** One or more transitions fired; the frame is the state after them. */
  | "firing"
  /**
   * Nothing fired, and the state is recorded all the same: a fresh anchor
   * for the continuous evolution when the previous event is far enough
   * back, the last state of an execution that does not end on a firing, or
   * the state a trace that joins an execution under way starts from.
   */
  | "reference";

/**
 * One record of an execution: the state at a point in time, with what a
 * consumer needs to carry it forward to the next event without the source
 * that produced it.
 */
export type TraceEvent = {
  /** Position in the trace; the first event is 0. */
  index: number;
  /** Position of the state this event records, in seconds or in steps. */
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
   * What the source publishes about itself with this state, by name: one
   * value per frame place index. A simulator's solver error is one.
   */
  diagnostics?: Readonly<Record<string, Float64Array>>;
};

/**
 * Whether an event changes the discrete state: the initial marking or a
 * firing. Reference events only re-anchor the state, so a viewer stepping
 * between events skips them.
 */
export const isDiscreteEvent = (event: Pick<TraceEvent, "kind">): boolean =>
  event.kind !== "reference";
