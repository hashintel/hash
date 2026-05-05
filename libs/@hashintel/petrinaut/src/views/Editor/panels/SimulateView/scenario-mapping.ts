import type { Scenario } from "../../../../core/types/sdcpn";
import type { ScenarioFormState } from "./scenario-form";

/**
 * Build a `Scenario` from the form state. Drops the draft `_key` field used
 * for stable React keys in the parameter list.
 *
 * @param state - the form state
 * @param id - the scenario id (use a new UUID for new scenarios, the existing
 *   scenario's id when updating)
 */
export function buildScenarioFromFormState(
  state: ScenarioFormState,
  id: string,
): Scenario {
  return {
    id,
    name: state.name.trim(),
    description: state.description.trim() || undefined,
    scenarioParameters: state.scenarioParams.map(
      ({ _key: _, ...rest }) => rest,
    ),
    parameterOverrides: state.parameterOverrides,
    initialState: state.initialStateAsCode
      ? { type: "code", content: state.initialStateCode }
      : {
          type: "per_place",
          content: {
            // Uncolored places: expression strings (token count)
            ...state.initialTokenCounts,
            // Colored places: number[][] (rows × elements), stored directly
            ...state.initialTokenData,
          },
        },
  };
}
