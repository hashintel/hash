/**
 * @layerRoot core.simulation.event-trace
 * @role Runs a net in a worker and writes the run as an execution trace: one event per firing, with its frame and its derivatives
 *
 * The worker advances the run with the stepper of the simulator the host
 * selected and records only the states that stepper finds worth keeping. The
 * host writes those events into an execution trace, which answers the state
 * at any time from them, so playback addresses time rather than frame
 * indices.
 */

export { createEventSimulation } from "./runtime";
export type {
  CreateEventSimulationConfig,
  EventSimulation,
  EventSimulationConfig,
} from "./runtime";
export type {
  EventSimulationCompleteEvent,
  EventSimulationErrorEvent,
  EventSimulationEvent,
} from "./trace";
export { SOLVER_ERROR_DIAGNOSTIC } from "./trace";
export {
  ADAPTIVE_SIMULATOR_ID,
  DEFAULT_SOLVER_TOLERANCE,
} from "../steppers/adaptive-stepper";
export { FIXED_STEP_SIMULATOR_ID } from "../steppers/fixed-step-stepper";
export type { StepperParameters } from "../steppers/run-stepper";
export type { StepperSelection } from "../steppers/steppers";
