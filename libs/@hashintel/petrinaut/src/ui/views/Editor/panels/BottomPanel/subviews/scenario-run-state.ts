/**
 * The pure state behind running a saved ad-hoc scenario from Simulation
 * Settings: the panel edits a local copy of the scenario's definition whose
 * only writable slots are the exposed Variables' values, and every edit is
 * pushed to the run as ordinary scenario-parameter values — the engine
 * contract (scenario id + parameter values) stays untouched.
 */

import {
  adHocExposedParameterIdentifier,
  synthesizeAdHocScenario,
} from "@hashintel/petrinaut-core";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

/**
 * The panel's editable copy of a saved ad-hoc definition: each exposed
 * Variable's expression is seeded from this session's run override where
 * one exists, so re-selecting the scenario keeps the values the user set.
 * Engine values are numeric strings (booleans as "1"/"0"); a boolean
 * Variable's expression gets the literal back.
 */
export function seedScenarioRunState(
  content: AdHocScenarioState,
  overrides: Record<string, string>,
): AdHocScenarioState {
  return {
    ...content,
    variables: content.variables.map((variable) => {
      if (!variable.exposed) {
        return variable;
      }
      const override =
        overrides[adHocExposedParameterIdentifier(variable.name)];
      if (override === undefined) {
        return variable;
      }
      const expression =
        variable.type === "boolean"
          ? override === "0"
            ? "false"
            : "true"
          : override;
      return { ...variable, expression };
    }),
  };
}

/**
 * The run values an edited copy produces: synthesis resolves each exposed
 * Variable's expression to its scenario parameter's constant. A copy that
 * does not synthesize (a value mid-edit) produces nothing — the previous
 * values stand until the expression resolves again.
 */
export function scenarioRunParameterValues(
  state: AdHocScenarioState,
  context: AdHocSynthesisContext,
): { identifier: string; value: string }[] {
  const synthesized = synthesizeAdHocScenario(state, context);
  if (!synthesized.ok) {
    return [];
  }
  return synthesized.scenario.scenarioParameters.map((parameter) => ({
    identifier: parameter.identifier,
    value: String(parameter.default),
  }));
}
