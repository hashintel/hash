/**
 * @layerRoot react.simulators
 * @role Carries the simulators a host registers to the providers that start runs and experiments with them
 */

import { createContext } from "react";

import {
  defaultSimulatorParameters,
  FIXED_STEP_SIMULATOR_ID,
  type SimulatorRegistration,
  type StoredSimulatorParameters,
} from "@hashintel/petrinaut-core";

/** Which simulator computes the next run, and with what parameter values. */
export type SimulatorSelection = {
  readonly simulatorId: string;
  readonly parameters: StoredSimulatorParameters;
};

export type SimulatorsContextValue = {
  /** Built-ins first, then what the host adds, in picker order. */
  readonly registrations: readonly SimulatorRegistration[];
  /** The simulator a session's Quick Simulation starts on. */
  readonly defaultSimulatorId: string;
};

/** A registration by id, or undefined when the host registered none under it. */
export const findSimulator = (
  registrations: readonly SimulatorRegistration[],
  simulatorId: string,
): SimulatorRegistration | undefined =>
  registrations.find((registration) => registration.id === simulatorId);

/** The selection a simulator starts on: every parameter at its default. */
export const defaultSelectionOf = (
  registrations: readonly SimulatorRegistration[],
  simulatorId: string,
): SimulatorSelection => {
  const registration = findSimulator(registrations, simulatorId);
  return {
    simulatorId,
    parameters: registration
      ? defaultSimulatorParameters(registration.parameters)
      : {},
  };
};

/**
 * No simulators: the value outside a `SimulatorsProvider`. A run cannot
 * start from it, and the picker shows nothing to pick.
 */
export const SimulatorsContext = createContext<SimulatorsContextValue>({
  registrations: [],
  defaultSimulatorId: FIXED_STEP_SIMULATOR_ID,
});
