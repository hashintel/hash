/**
 * @layerRoot core.simulation.event-trace
 * @role Runs a net as a trace of events, one frame per firing with its derivatives, and reads the state at any time by interpolating between them
 *
 * The event-driven counterpart of the frame-per-step runtime. The worker
 * steps the fixed-step engine at a small step and records only the steps
 * where something happened; the host keeps those events and reconstructs the
 * state at any time from them, so playback addresses time rather than frame
 * indices. Everything here is its own path: nothing in the frame runtime
 * changes to make room for it.
 */

export { createEventSimulation } from "./runtime";
export type {
  CreateEventSimulationConfig,
  EventSimulation,
  EventSimulationConfig,
} from "./runtime";
export { interpolateFrame } from "./interpolation";
export { createInMemoryEventTraceStore } from "./trace-store";
export type { EventTraceStore } from "./trace-store";
export type {
  EventSimulationCompleteEvent,
  EventSimulationErrorEvent,
  EventSimulationEvent,
  EventTraceSummary,
  TraceEvent,
  TraceEventKind,
} from "./trace";
export {
  DEFAULT_EVENT_STEP_DT,
  DEFAULT_REFERENCE_INTERVAL,
} from "./worker/trace-stepper";
