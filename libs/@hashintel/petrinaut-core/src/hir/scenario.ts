/**
 * Lowering of a scenario's user code into serializable HIR.
 *
 * This module (transitively) imports `typescript`, so it stays out of
 * browser main bundles: browser callers lower through the language worker
 * (`sdcpn/lowerScenario`), Node callers (the CLI) lower inline. The pure
 * side — type checking and interpretation — lives in `compileScenario`,
 * which takes the result of this function as an argument.
 */
import { synthesizeAdHocScenario } from "../simulation/authoring/scenario/ad-hoc/ad-hoc-scenario";
import { createUserKeyedRecord } from "../validation/record-keys";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { AdHocSynthesisContext } from "../simulation/authoring/scenario/ad-hoc/ad-hoc-scenario";
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

export type LowerScenarioToHirOptions = {
  /**
   * The net context an ad-hoc initial state synthesizes against. Required
   * to lower a scenario whose `initialState.type` is `"adhoc"` — the
   * definition generates code-mode source from the net's places and types.
   */
  adHocContext?: AdHocSynthesisContext;
};

/** A lowering-level failure with no user-source span to point at. */
const loweringError = (message: string): ScenarioHirItem => ({
  ok: false,
  diagnostics: [
    {
      code: "hir:adhoc-synthesis",
      message,
      severity: "error",
      span: { start: 0, length: 0 },
    },
  ],
});

/** Synthesizes an ad-hoc definition and lowers the generated code body. */
function lowerAdHocInitialState(
  state: Extract<Scenario["initialState"], { type: "adhoc" }>["content"],
  context: AdHocSynthesisContext | undefined,
): ScenarioHirItem {
  if (!context) {
    return loweringError(
      "This scenario's ad-hoc initial state needs the net context to lower; pass adHocContext.",
    );
  }
  const synthesized = synthesizeAdHocScenario(state, context);
  if (!synthesized.ok) {
    return loweringError(
      synthesized.errors.map((error) => error.message).join("\n"),
    );
  }
  return synthesized.scenario.initialState.type === "code"
    ? lowerItem(synthesized.scenario.initialState.content, "scenario-code")
    : loweringError("Ad-hoc synthesis produced no code-mode initial state.");
}

/**
 * Lowers every expression and code block of `scenario` to HIR. Pure text
 * transformation needing no net context — except an ad-hoc initial state,
 * which synthesizes against `options.adHocContext` first.
 */
export function lowerScenarioToHir(
  scenario: ScenarioLoweringInput,
  options: LowerScenarioToHirOptions = {},
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
  } else if (scenario.initialState.type === "adhoc") {
    initialStateCode = lowerAdHocInitialState(
      scenario.initialState.content,
      options.adHocContext,
    );
  } else if (scenario.initialState.content.trim() !== "") {
    initialStateCode = lowerItem(
      scenario.initialState.content,
      "scenario-code",
    );
  }

  return { version: 1, parameterOverrides, placeExpressions, initialStateCode };
}
