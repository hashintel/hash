/**
 * Lowering and checking of optimization constraints: boolean conditions
 * authored as TypeScript and carried as serialized HIR in the optimization
 * manifest, so the frontend, the CLI, and the Python binding all read one
 * shared expression representation.
 *
 * Two spaces, two surfaces:
 * - a **parameter-space** constraint is one expression over the sampled
 *   scenario parameters (`scenario.*`) and the net parameters
 *   (`parameters.*`) — the `scenario-expression` surface with a boolean
 *   expected type;
 * - a **state-space** constraint is a metric-shaped body over the
 *   simulation `state` — the `metric` surface, checked to return boolean.
 *
 * This module (transitively) imports `typescript`, so it stays out of
 * browser main bundles: browser callers lower through the language worker
 * (`sdcpn/lowerConstraint`), Node callers lower inline.
 */

import { lowerTypeScriptToHir } from "./lower-typescript";
import {
  buildMetricContext,
  buildScenarioExpressionContext,
} from "./surface-context";
import { typecheckHir } from "./typecheck";

import type {
  Parameter,
  ScenarioParameter,
  SDCPN,
} from "../types/sdcpn";
import type { HirDiagnostic, HirFunction } from "./hir";
import type { PetrinautExtensionSettings } from "../extensions";

export type OptimizationConstraintSpace = "parameterSpace" | "stateSpace";

/** What a constraint's condition ranges over, per space. */
export type LowerOptimizationConstraintContext = {
  /** Net parameters, ambient as `parameters.*` on both surfaces. */
  netParameters: readonly Parameter[];
  /** The study's scenario parameters (`scenario.*`); parameter space only. */
  scenarioParameters: readonly ScenarioParameter[];
  /** The net the simulation `state` exposes; state space only. */
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
};

export type LowerOptimizationConstraintResult =
  | { ok: true; hir: HirFunction }
  | { ok: false; diagnostics: HirDiagnostic[] };

/**
 * Lowers one constraint's source and checks that it produces a boolean.
 * Returns the serialized HIR to embed in the manifest, or the lowering and
 * type diagnostics (spans relative to the user's source).
 */
export function lowerOptimizationConstraint(
  code: string,
  space: OptimizationConstraintSpace,
  context: LowerOptimizationConstraintContext,
): LowerOptimizationConstraintResult {
  const lowered = lowerTypeScriptToHir(
    code,
    space === "parameterSpace" ? "scenario-expression" : "metric",
  );
  if (!lowered.ok) {
    return { ok: false, diagnostics: lowered.diagnostics };
  }
  const surfaceContext =
    space === "parameterSpace"
      ? buildScenarioExpressionContext(
          [...context.netParameters],
          [...context.scenarioParameters],
          "boolean",
        )
      : buildMetricContext(context.sdcpn, context.extensions, "boolean");
  const checked = typecheckHir(lowered.fn, surfaceContext);
  const errors = checked.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    return { ok: false, diagnostics: errors };
  }
  return { ok: true, hir: lowered.fn };
}
