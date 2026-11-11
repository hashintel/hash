import { runClockOf } from "../../../net-timing";
import {
  ADAPTIVE_SIMULATOR_ID,
  createAdaptiveStepper,
  readAdaptiveStepperParameters,
} from "./adaptive-stepper";
import {
  createFixedStepStepper,
  FIXED_STEP_SIMULATOR_ID,
  readFixedStepStepperParameters,
} from "./fixed-step-stepper";
import { createStepStepper } from "./step-stepper";

import type { MonteCarloSimulatorSelection } from "../../monte-carlo/run-driver";
import type { RunStepper, RunStepperConfig } from "./run-stepper";

/**
 * Which simulator steps a run, and with what parameter values: the id of a
 * simulator whose stepper this worker hosts.
 */
export type StepperSelection = MonteCarloSimulatorSelection;

/**
 * Builds the stepper of the selected simulator. Throws for a simulator this
 * worker does not host and for a parameter its stepper rejects.
 */
export function createStepper(
  selection: StepperSelection,
  config: RunStepperConfig,
): RunStepper {
  switch (selection.id) {
    case FIXED_STEP_SIMULATOR_ID:
      return createFixedStepStepper(
        config,
        readFixedStepStepperParameters(selection.parameters),
      );
    case ADAPTIVE_SIMULATOR_ID:
      return createAdaptiveStepper(
        config,
        readAdaptiveStepperParameters(selection.parameters),
      );
    default:
      throw new Error(
        `Simulator "${selection.id}" has no stepper in the event simulation worker`,
      );
  }
}

/**
 * Builds the stepper of a single run, the one a person plays back.
 *
 * A timed net is stepped by the selected simulator. An untimed net has
 * nothing a simulator of time could integrate or wait for, so its run is a
 * sequence of steps whichever simulator is selected.
 */
export function createRunStepper(
  selection: StepperSelection,
  config: RunStepperConfig,
): RunStepper {
  return runClockOf(config.sdcpn, config.extensions) === "steps"
    ? createStepStepper(config)
    : createStepper(selection, config);
}
