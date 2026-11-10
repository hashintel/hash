/**
 * @layerRoot core.simulation.event-trace
 * @role Runs a net as a trace of events, one frame per firing with its derivatives, and reads the state at any time by interpolating between them
 *
 * The event-driven counterpart of the frame-per-step runtime. The worker
 * advances the run with the stepper of the simulator the host selected and
 * records only the states that stepper finds worth keeping; the host keeps
 * those events and reconstructs the state at any time from them, so playback
 * addresses time rather than frame indices. Everything here is its own path:
 * nothing in the frame runtime changes to make room for it.
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
export { SOLVER_ERROR_DIAGNOSTIC } from "./trace";
export { ADAPTIVE_SIMULATOR_ID } from "./worker/adaptive-stepper";
export { FIXED_STEP_SIMULATOR_ID } from "./worker/fixed-step-stepper";
export type { StepperParameters } from "./worker/run-stepper";
export type { StepperSelection } from "./worker/steppers";
export { DEFAULT_SOLVER_TOLERANCE } from "./solver/solver-config";
