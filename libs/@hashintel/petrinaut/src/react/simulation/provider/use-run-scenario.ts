import {
  compileScenario,
  synthesizeAdHocScenario,
  type AdHocScenarioState,
  type CompiledScenarioResult,
  type Parameter,
  type Scenario,
  type ScenarioCompilationError,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { useScenarioHir, type ScenarioHirRequest } from "../use-scenario-hir";

/**
 * What a run compiles: a scenario with the net parameters its expressions
 * read, or the reasons an inline definition cannot run.
 */
type RunScenarioTarget =
  | { kind: "scenario"; scenario: Scenario; netParameters: Parameter[] }
  | { kind: "invalid"; errors: ScenarioCompilationError[] };

type CompiledTarget = {
  compiled: CompiledScenarioResult | null;
  errors: ScenarioCompilationError[] | null;
};

const NO_PARAMETERS: Parameter[] = [];

// Also while lowering is in flight: the scenario is neither applied nor
// failing for that render, as a just-selected scenario is.
const NOT_COMPILED: CompiledTarget = { compiled: null, errors: null };

/**
 * The target lowered in the language worker, then type-checked and
 * interpreted during render.
 *
 * A hook of its own so that the target arrives as an argument: React Compiler
 * holds a value handed to a hook, and rebuilds on every render one that is
 * built before a hook call and read after it.
 */
const useCompiledTarget = (
  target: RunScenarioTarget | null,
  places: SDCPN["places"],
  types: SDCPN["types"],
  netParameters: Parameter[],
  requestScenarioHir: ScenarioHirRequest,
): CompiledTarget => {
  const hirState = useScenarioHir(
    target?.kind === "scenario" ? target.scenario : undefined,
    {
      requestScenarioHir,
      // A persisted ad-hoc scenario synthesizes in the worker against the
      // net; an inline definition was synthesized before it got here.
      adHocContext: { netParameters, places, types },
    },
  );

  if (!target) {
    return NOT_COMPILED;
  }
  if (target.kind === "invalid") {
    return { compiled: null, errors: target.errors };
  }
  if (hirState.error !== null) {
    // Kept visible: a failing scenario must not look like an applied one.
    return {
      compiled: null,
      errors: [
        {
          source: "initialState",
          itemId: "__lowering__",
          message: `Scenario code could not be compiled: ${hirState.error}`,
        },
      ],
    };
  }
  if (hirState.hir === null) {
    return NOT_COMPILED;
  }
  const outcome = compileScenario(
    target.scenario,
    hirState.hir,
    target.netParameters,
    places,
    types,
  );
  return outcome.ok
    ? { compiled: outcome.result, errors: null }
    : { compiled: null, errors: outcome.errors };
};

/**
 * The target a run compiles, with the preview of it. A hook of its own so
 * that the net parameters arrive as arguments (see `useCompiledTarget`): the
 * context hands `adHocNetParameters` out, and it must change only with the
 * parameters and their typed values.
 */
const useRunTarget = ({
  selectedScenario,
  scenarioParameterValues,
  adHocScenario,
  netParameters,
  adHocNetParameters,
  places,
  types,
  requestScenarioHir,
}: {
  selectedScenario: Scenario | undefined;
  scenarioParameterValues: Record<string, string>;
  adHocScenario: AdHocScenarioState | null;
  netParameters: Parameter[];
  adHocNetParameters: Parameter[];
  places: SDCPN["places"];
  types: SDCPN["types"];
  requestScenarioHir: ScenarioHirRequest;
}): CompiledTarget & { target: RunScenarioTarget | null } => {
  const adHocSynthesized =
    !selectedScenario && adHocScenario
      ? synthesizeAdHocScenario(adHocScenario, {
          netParameters: adHocNetParameters,
          places,
          types,
        })
      : null;

  let target: RunScenarioTarget | null = null;
  if (selectedScenario) {
    target = {
      kind: "scenario",
      scenario: {
        ...selectedScenario,
        scenarioParameters: selectedScenario.scenarioParameters.map(
          (parameter) => ({
            ...parameter,
            default: Number(
              scenarioParameterValues[parameter.identifier] ??
                parameter.default,
            ),
          }),
        ),
      },
      netParameters,
    };
  } else if (adHocSynthesized?.ok) {
    target = {
      kind: "scenario",
      scenario: adHocSynthesized.scenario,
      netParameters: adHocNetParameters,
    };
  } else if (adHocSynthesized) {
    // A broken inline definition refuses to run: falling back to the manual
    // marking would silently ignore what was typed.
    target = {
      kind: "invalid",
      errors: adHocSynthesized.errors.map((synthesisError) => ({
        source:
          synthesisError.source === "netParameter"
            ? "parameterOverride"
            : "initialState",
        itemId: synthesisError.itemId,
        message: synthesisError.message,
      })),
    };
  }

  const { compiled, errors } = useCompiledTarget(
    target,
    places,
    types,
    netParameters,
    requestScenarioHir,
  );
  return { target, compiled, errors };
};

/**
 * The scenario in effect: the selected one with the typed values as its
 * parameter defaults, else the inline definition as a scenario that is never
 * saved. `target` is what a run compiles; `compiled` and `errors` are the
 * preview of it.
 */
export const useRunScenario = ({
  definition,
  parametersEnabled,
  selectedScenario,
  parameterValues,
  scenarioParameterValues,
  adHocScenario,
  requestScenarioHir,
}: {
  definition: SDCPN;
  parametersEnabled: boolean;
  selectedScenario: Scenario | undefined;
  parameterValues: Record<string, string>;
  scenarioParameterValues: Record<string, string>;
  adHocScenario: AdHocScenarioState | null;
  requestScenarioHir: ScenarioHirRequest;
}): CompiledTarget & {
  target: RunScenarioTarget | null;
  adHocNetParameters: Parameter[];
} => {
  const { parameters, places, types } = definition;
  const netParameters = parametersEnabled ? parameters : NO_PARAMETERS;
  // The panel's inputs own the parameter values, so an inline definition
  // reads the net parameters with those values as their defaults.
  const adHocNetParameters = parametersEnabled
    ? parameters.map((parameter) => ({
        ...parameter,
        defaultValue:
          parameterValues[parameter.variableName] ?? parameter.defaultValue,
      }))
    : NO_PARAMETERS;
  const { target, compiled, errors } = useRunTarget({
    selectedScenario,
    scenarioParameterValues,
    adHocScenario,
    netParameters,
    adHocNetParameters,
    places,
    types,
    requestScenarioHir,
  });
  return { target, compiled, errors, adHocNetParameters };
};
