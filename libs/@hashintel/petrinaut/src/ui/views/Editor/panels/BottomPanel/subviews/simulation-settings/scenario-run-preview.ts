import {
  classicScenarioRunState,
  compileScenario,
  createUserKeyedRecord,
} from "@hashintel/petrinaut-core";

import type { ScenarioHirState } from "../../../../../../../react/simulation/use-scenario-hir";
import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  Scenario,
} from "@hashintel/petrinaut-core";

export interface ScenarioRunPreview {
  /** What the run form shows: the variables as given, and the preview as far as it is ready. */
  state: AdHocScenarioState;
  /** Why the preview is missing, or what it leaves out. */
  notice: string | null;
  previewReady: boolean;
}

/**
 * What the run form of a selected scenario shows beside its `variables`: the
 * net parameters and the places the run will start with, compiled from the
 * scenario with the values set for this run. Until that compiles, the form
 * shows the scenario's own parameter overrides, no place, and a notice.
 */
export const scenarioRunPreview = (
  scenario: Scenario,
  scenarioHir: ScenarioHirState,
  net: AdHocSynthesisContext,
  scenarioParameterValues: Readonly<Record<string, string>>,
  variables: AdHocScenarioState["variables"],
): ScenarioRunPreview => {
  const withoutPreview = (notice: string): ScenarioRunPreview => ({
    state: {
      variables,
      netParameters: Object.entries(scenario.parameterOverrides).map(
        ([parameterId, expression]) => ({
          parameterId,
          expression,
          optimize: null,
        }),
      ),
      places: {},
    },
    notice,
    previewReady: false,
  });
  if (scenarioHir.error !== null) {
    return withoutPreview(
      `The initial state preview could not be compiled: ${scenarioHir.error}`,
    );
  }
  if (scenarioHir.hir === null) {
    return withoutPreview("Compiling the initial state preview…");
  }
  const numericValues = createUserKeyedRecord<number>();
  for (const [identifier, value] of Object.entries(scenarioParameterValues)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      numericValues[identifier] = parsed;
    }
  }
  const outcome = compileScenario(
    scenario,
    scenarioHir.hir,
    net.netParameters,
    net.places,
    net.types,
    { scenarioParameterValues: numericValues },
  );
  if (!outcome.ok) {
    return withoutPreview(
      `The initial state preview could not be computed: ${outcome.errors
        .map((error) => error.message)
        .join(" · ")}`,
    );
  }
  const materialized = classicScenarioRunState(
    scenario,
    outcome.result.initialState,
    { places: net.places, types: net.types },
    scenarioParameterValues,
  );
  return {
    state: {
      ...materialized.state,
      variables,
      netParameters: net.netParameters.flatMap((parameter) => {
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
    },
    notice:
      materialized.truncated.length > 0
        ? `Preview truncated: ${materialized.truncated
            .map(
              (cut) =>
                `${cut.placeName} shows ${cut.shown} of ${cut.total} rows`,
            )
            .join(" · ")}`
        : null,
    previewReady: true,
  };
};
