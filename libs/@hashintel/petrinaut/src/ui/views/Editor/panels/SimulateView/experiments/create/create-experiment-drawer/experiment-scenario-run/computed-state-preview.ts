import {
  classicScenarioRunState,
  compileScenario,
  createUserKeyedRecord,
} from "@hashintel/petrinaut-core";

import type { ExperimentParameterInput } from "../../../../../../../../../react/experiments/parameter-grid";
import type { ScenarioHirState } from "../../../../../../../../../react/simulation/use-scenario-hir";
import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

type ComputedStatePreview =
  | { ready: false; notice: string }
  | {
      ready: true;
      notice: string | null;
      places: AdHocScenarioState["places"];
      netParameters: AdHocScenarioState["netParameters"];
    };

/**
 * The state each run of a saved scenario starts with, for the form's
 * "Computed state" sub-section. The parameters are the resolved values
 * compilation produces (defaults, overrides and ad-hoc entries applied), not
 * the override expressions.
 */
export const computedStatePreview = ({
  hirState,
  scenario,
  inputs,
  context,
}: {
  hirState: ScenarioHirState;
  scenario: Scenario;
  inputs: Readonly<Record<string, ExperimentParameterInput>>;
  context: AdHocSynthesisContext;
}): ComputedStatePreview => {
  if (hirState.error !== null) {
    return {
      ready: false,
      notice: `The state preview could not be compiled: ${hirState.error}`,
    };
  }
  if (hirState.hir === null) {
    return { ready: false, notice: "Computing the state preview…" };
  }
  // A fixed input previews as given. A swept one previews at the start of
  // its range — the first combination the sweep runs — and the notice
  // says so, since the panel promises the exact state each run starts
  // with and a swept parameter has one per combination.
  const previewValues = createUserKeyedRecord<string>();
  const sweptAtStart: string[] = [];
  for (const [identifier, input] of Object.entries(inputs)) {
    if (input.mode === "fixed") {
      previewValues[identifier] = input.value;
    } else {
      previewValues[identifier] = String(input.min);
      sweptAtStart.push(`${identifier} = ${input.min}`);
    }
  }
  const numericValues = createUserKeyedRecord<number>();
  for (const [identifier, value] of Object.entries(previewValues)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      numericValues[identifier] = parsed;
    }
  }
  const outcome = compileScenario(
    scenario,
    hirState.hir,
    context.netParameters,
    context.places,
    context.types,
    { scenarioParameterValues: numericValues },
  );
  if (!outcome.ok) {
    return {
      ready: false,
      notice: `The state preview could not be computed: ${outcome.errors
        .map((error) => error.message)
        .join(" · ")}`,
    };
  }
  const materialized = classicScenarioRunState(
    scenario,
    outcome.result.initialState,
    { places: context.places, types: context.types },
    previewValues,
  );
  const notices = [
    sweptAtStart.length > 0
      ? `Swept parameters shown at the start of their ranges: ${sweptAtStart.join(", ")}`
      : null,
    materialized.truncated.length > 0
      ? `Preview truncated: ${materialized.truncated
          .map(
            (cut) => `${cut.placeName} shows ${cut.shown} of ${cut.total} rows`,
          )
          .join(" · ")}`
      : null,
  ].filter((notice) => notice !== null);
  return {
    ready: true,
    notice: notices.length > 0 ? notices.join(" · ") : null,
    places: materialized.state.places,
    netParameters: context.netParameters.flatMap((parameter) => {
      const resolved = outcome.result.parameterValues[parameter.variableName];
      return resolved === undefined
        ? []
        : [
            {
              parameterId: parameter.id,
              expression: resolved,
              optimize: null,
            },
          ];
    }),
  };
};
