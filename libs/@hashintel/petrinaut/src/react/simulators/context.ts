/**
 * @layerRoot react.simulators
 * @role Carries the simulators a host registers to the providers that start runs and experiments with them
 */

import { createContext } from "react";

import {
  FIXED_STEP_SIMULATOR_ID,
  type SimulatorRegistration,
  type StoredSimulatorParameters,
} from "@hashintel/petrinaut-core";

/**
 * What Play computes. `quick` is one run, played on the canvas. `stochastic`
 * is many runs, shown as what they add up to.
 */
export type SimulationMode = "quick" | "stochastic";

/** Which simulator computes the next run, and with what parameter values. */
export type SimulatorSelection = {
  readonly simulatorId: string;
  readonly parameters: StoredSimulatorParameters;
};

export type SimulatorsContextValue = {
  /** Built-ins first, then what the host adds, in picker order. */
  readonly registrations: readonly SimulatorRegistration[];
  /**
   * What each mode starts a session on: a simulator, and the parameters it
   * holds away from their defaults. A step that suits one played run is
   * wasteful for hundreds, so the two modes start on different ones.
   */
  readonly defaultSelections: Readonly<
    Record<
      SimulationMode,
      {
        readonly simulatorId: string;
        readonly parameters?: StoredSimulatorParameters;
      }
    >
  >;
};

/** A registration by id, or undefined when the host registered none under it. */
export const findSimulator = (
  registrations: readonly SimulatorRegistration[],
  simulatorId: string,
): SimulatorRegistration | undefined =>
  registrations.find((registration) => registration.id === simulatorId);

/**
 * Why a simulator cannot compute what a mode shows, or null when it can.
 * Known from the registration alone, so a picker asks nothing of a
 * simulator it has not loaded.
 */
export const simulatorRefusal = (
  registration: SimulatorRegistration,
  mode: SimulationMode,
): string | null => {
  if (!registration.isAvailable()) {
    return "Not supported by this browser";
  }
  if (mode === "quick" && !registration.produces.run) {
    return "Computes many runs at once";
  }
  if (mode === "stochastic" && !registration.produces.experiment) {
    return "Computes one run at a time";
  }
  return null;
};

/**
 * No simulators: the value outside a `SimulatorsProvider`. A run cannot
 * start from it, and the picker shows nothing to pick.
 */
export const SimulatorsContext = createContext<SimulatorsContextValue>({
  registrations: [],
  defaultSelections: {
    quick: { simulatorId: FIXED_STEP_SIMULATOR_ID },
    stochastic: { simulatorId: FIXED_STEP_SIMULATOR_ID },
  },
});
