import type { Scenario } from "@hashintel/petrinaut-core";

/** The select's value for "No scenario"; never a scenario's id. */
export const NO_SCENARIO_VALUE = "__none__";

/**
 * The scenario the form stands on: the picked one while the net has it, else
 * the net's first. Undefined once "No scenario" is picked, or without any.
 */
export const resolveScenarioSelection = (
  scenarios: readonly Scenario[],
  selectedScenarioId: string | null,
): Scenario | undefined =>
  selectedScenarioId === NO_SCENARIO_VALUE
    ? undefined
    : (scenarios.find((scenario) => scenario.id === selectedScenarioId) ??
      scenarios[0]);
