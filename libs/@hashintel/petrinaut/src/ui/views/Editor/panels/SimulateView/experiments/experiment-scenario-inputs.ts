/**
 * The experiment inputs a run-mode form produces for a saved scenario: a
 * fixed value for every scenario parameter the form holds a literal for,
 * and a range for every parameter whose Variable carries a Sweep selection.
 * Ranges come from synthesis, which resolves a selection's bounds to
 * constants and reports a bound that does not resolve at its slot, so a
 * form with an invalid bound produces no range for it and the drawer's
 * previous input stands.
 */

import {
  classicRunParameterValues,
  synthesizeAdHocOptimization,
} from "@hashintel/petrinaut-core";

import type { ExperimentParameterInput } from "../../../../../../react/experiments/parameter-grid";
import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

export type ScenarioRunInput = {
  identifier: string;
  input: ExperimentParameterInput;
};

export function scenarioRunInputs(
  state: AdHocScenarioState,
  scenario: Scenario,
  context: AdHocSynthesisContext,
): ScenarioRunInput[] {
  const inputs: ScenarioRunInput[] = [];

  if (state.variables.some((variable) => variable.optimize !== null)) {
    const synthesized = synthesizeAdHocOptimization(state, context);
    if (synthesized.ok) {
      for (const field of synthesized.output.optimizedFields) {
        if (
          field.target.kind !== "variable" ||
          field.target.placeId !== null ||
          field.domain.kind === "boolean"
        ) {
          continue;
        }
        const variable = state.variables[field.target.index];
        if (variable) {
          inputs.push({
            identifier: variable.name,
            input: {
              mode: "range",
              min: field.domain.minimum,
              max: field.domain.maximum,
            },
          });
        }
      }
    }
  }

  // A swept Variable has no fixed value: the classic identifiers are the
  // Variable names, so leaving it out of the lookup skips it.
  const fixedState: AdHocScenarioState = {
    ...state,
    variables: state.variables.filter((variable) => variable.optimize === null),
  };
  for (const { identifier, value } of classicRunParameterValues(
    fixedState,
    scenario,
  )) {
    inputs.push({ identifier, input: { mode: "fixed", value } });
  }

  return inputs;
}
