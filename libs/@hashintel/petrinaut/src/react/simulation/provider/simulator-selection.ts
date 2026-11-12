import { defaultSimulatorParameters } from "@hashintel/petrinaut-core";

import { findSimulator } from "../../simulators/context";

import type {
  SimulationMode,
  SimulatorSelection,
  SimulatorsContextValue,
} from "../../simulators/context";
import type { StoredSimulatorParameters } from "@hashintel/petrinaut-core";

/** What a session holds of the user's choice of simulator. */
export type SimulatorChoices = {
  /** The simulator picked in each mode. Null follows the host's default. */
  simulatorIds: Record<SimulationMode, string | null>;
  /**
   * The parameter values edited for each simulator in each mode, kept
   * across a switch. Keyed by {@link simulatorParametersKey}.
   */
  simulatorParameters: Record<string, StoredSimulatorParameters>;
};

export const simulatorParametersKey = (
  mode: SimulationMode,
  simulatorId: string,
): string => `${mode}:${simulatorId}`;

/**
 * The selection in effect for a mode: the picked simulator, or the host's
 * default when none was picked or the picked one is no longer registered.
 * Its parameters are the spec's defaults, then the host's for the mode when
 * the simulator is the mode's default, then whatever was edited.
 */
export const simulatorSelectionIn = (
  mode: SimulationMode,
  choices: SimulatorChoices,
  simulators: SimulatorsContextValue,
): SimulatorSelection => {
  const modeDefault = simulators.defaultSelections[mode];
  const pickedId = choices.simulatorIds[mode];
  const selected =
    (pickedId
      ? findSimulator(simulators.registrations, pickedId)
      : undefined) ??
    findSimulator(simulators.registrations, modeDefault.simulatorId);
  return {
    simulatorId: selected?.id ?? modeDefault.simulatorId,
    parameters: selected
      ? {
          ...defaultSimulatorParameters(selected.parameters),
          ...(selected.id === modeDefault.simulatorId
            ? modeDefault.parameters
            : undefined),
          ...choices.simulatorParameters[
            simulatorParametersKey(mode, selected.id)
          ],
        }
      : {},
  };
};
