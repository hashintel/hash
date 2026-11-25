import {
  classicScenarioRunState,
  compileScenario,
  createUserKeyedRecord,
} from "@hashintel/petrinaut-core";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  Scenario,
  ScenarioHir,
  TruncatedPlace,
} from "@hashintel/petrinaut-core";

type ScenarioStartState =
  | {
      ok: false;
      /** The compile errors, joined into one line. */
      errors: string;
    }
  | {
      ok: true;
      places: AdHocScenarioState["places"];
      /** The resolved value of each net parameter: defaults, overrides and ad-hoc entries applied. */
      netParameters: AdHocScenarioState["netParameters"];
      /** The places that show fewer rows than they hold. */
      truncated: TruncatedPlace[];
    };

/**
 * The state a run of a saved scenario starts with, for the given values of
 * its parameters: the places and the net parameters, as a run form shows
 * them. A value that is not a finite number is left to the scenario's
 * default. The caller words the notice: each form names its preview its own
 * way.
 */
export const scenarioStartState = (
  scenario: Scenario,
  hir: ScenarioHir,
  net: AdHocSynthesisContext,
  scenarioParameterValues: Readonly<Record<string, string>>,
): ScenarioStartState => {
  const numericValues = createUserKeyedRecord<number>();
  for (const [identifier, value] of Object.entries(scenarioParameterValues)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      numericValues[identifier] = parsed;
    }
  }
  const outcome = compileScenario(
    scenario,
    hir,
    net.netParameters,
    net.places,
    net.types,
    { scenarioParameterValues: numericValues },
  );
  if (!outcome.ok) {
    return {
      ok: false,
      errors: outcome.errors.map((error) => error.message).join(" · "),
    };
  }
  const materialized = classicScenarioRunState(
    scenario,
    outcome.result.initialState,
    { places: net.places, types: net.types },
    scenarioParameterValues,
  );
  return {
    ok: true,
    places: materialized.state.places,
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
    truncated: materialized.truncated,
  };
};

/** Which places a preview cuts short, or null when it shows every row. */
export const truncationNotice = (
  truncated: readonly TruncatedPlace[],
): string | null =>
  truncated.length > 0
    ? `Preview truncated: ${truncated
        .map(
          (cut) => `${cut.placeName} shows ${cut.shown} of ${cut.total} rows`,
        )
        .join(" · ")}`
    : null;
