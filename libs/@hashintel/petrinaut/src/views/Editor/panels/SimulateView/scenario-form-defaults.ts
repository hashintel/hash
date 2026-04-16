import type { ScenarioFormState } from "./scenario-form";

/**
 * Empty defaults for a new scenario form.
 */
export const EMPTY_SCENARIO_FORM_STATE: ScenarioFormState = {
  name: "",
  description: "",
  scenarioParams: [],
  parameterOverrides: {},
  initialTokenCounts: {},
  initialTokenData: {},
  showAllPlaces: false,
  initialStateAsCode: false,
  initialStateCode: "",
};
