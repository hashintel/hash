/**
 * Lowering of a scenario's user code into serializable HIR.
 *
 * This module (transitively) imports `typescript`, so it stays out of
 * browser main bundles: the LSP worker lowers scenarios for the editor
 * (`sdcpn/lowerScenario`), Node callers (the CLI) lower inline. The pure
 * side — type checking and interpretation — lives in `compileScenario`,
 * which takes the result of this function as an argument.
 */
import { createUserKeyedRecord } from "../validation/record-keys";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { Scenario } from "../types/sdcpn";
import type { HirDiagnostic, HirFunction } from "./hir";

export type ScenarioHirItem =
  | { ok: true; fn: HirFunction }
  | { ok: false; diagnostics: HirDiagnostic[] };

/**
 * The lowered (not yet type-checked) HIR of every expression and code block
 * a scenario carries. JSON-serializable, so it crosses the LSP worker
 * boundary like `HirArtifacts`. Entries exist only for non-empty code —
 * empty overrides keep the parameter default and empty expressions mean
 * zero tokens, without evaluation.
 */
export type ScenarioHir = {
  version: 1;
  /** Override expressions keyed by net parameter id. */
  parameterOverrides: Record<string, ScenarioHirItem>;
  /** Uncoloured per-place count expressions keyed by place id
   * (`initialState.type === "per_place"` string entries). */
  placeExpressions: Record<string, ScenarioHirItem>;
  /** The code-mode initial state body (`initialState.type === "code"`). */
  initialStateCode?: ScenarioHirItem;
};

function lowerItem(
  code: string,
  surface: "scenario-expression" | "scenario-code",
): ScenarioHirItem {
  const lowered = lowerTypeScriptToHir(code, surface);
  return lowered.ok
    ? { ok: true, fn: lowered.fn }
    : { ok: false, diagnostics: lowered.diagnostics };
}

/** The parts of a scenario that lowering reads: its code, nothing else. */
export type ScenarioLoweringInput = Pick<
  Scenario,
  "parameterOverrides" | "initialState"
>;

/**
 * Lowers every expression and code block of `scenario` to HIR. Pure text
 * transformation: no net context is needed — `compileScenario` type-checks
 * the result against the net's parameters and places before interpreting.
 */
export function lowerScenarioToHir(
  scenario: ScenarioLoweringInput,
): ScenarioHir {
  // Keyed by parameter/place ids from the net definition: no prototype.
  const parameterOverrides = createUserKeyedRecord<ScenarioHirItem>();
  for (const [parameterId, expression] of Object.entries(
    scenario.parameterOverrides,
  )) {
    if (expression.trim() !== "") {
      parameterOverrides[parameterId] = lowerItem(
        expression,
        "scenario-expression",
      );
    }
  }

  const placeExpressions = createUserKeyedRecord<ScenarioHirItem>();
  let initialStateCode: ScenarioHirItem | undefined;
  if (scenario.initialState.type === "per_place") {
    for (const [placeId, value] of Object.entries(
      scenario.initialState.content,
    )) {
      if (typeof value === "string" && value.trim() !== "") {
        placeExpressions[placeId] = lowerItem(value, "scenario-expression");
      }
    }
  } else if (scenario.initialState.content.trim() !== "") {
    initialStateCode = lowerItem(
      scenario.initialState.content,
      "scenario-code",
    );
  }

  return { version: 1, parameterOverrides, placeExpressions, initialStateCode };
}
