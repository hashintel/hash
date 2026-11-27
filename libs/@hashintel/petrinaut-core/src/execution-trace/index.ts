/**
 * @layerRoot core.execution-trace
 * @role The record of one execution as events on a time axis, whoever produced it: written by a simulator or by a host, read at any position, and played by one player
 *
 * A source keeps the writer and writes events; everything that shows the
 * execution takes the trace. A simulator's worker and a host's mapping of
 * what a real system did write the same events, so the canvas, the timeline
 * and the player read one object and never ask where it came from.
 */

export { createExecutionTrace, wallClockMsAt } from "./execution-trace";
export type {
  ExecutionTrace,
  ExecutionTraceConfig,
  TraceCoverage,
  TraceWriter,
} from "./execution-trace";
export { interpolateFrame } from "./interpolation";
export { createTraceEncoder } from "./trace-encoder";
export type {
  TraceEncoder,
  TraceFiring,
  TraceMarking,
  TraceToken,
} from "./trace-encoder";
export { isDiscreteEvent } from "./trace-event";
export type { TraceEvent, TraceEventKind } from "./trace-event";
export {
  createTracePlayer,
  effectivePlayMode,
  EVENT_PLAY_MODE_LEAD,
  findRestingTime,
  findStepTargetIndex,
} from "./trace-player";
export type {
  PlayableTrace,
  TracePlayer,
  TracePlayerLoadOptions,
  TracePlayerSnapshot,
} from "./trace-player";
export { createInMemoryEventTraceStore } from "./trace-store";
export type { EventTraceStore } from "./trace-store";
