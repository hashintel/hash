/**
 * Lowering of one constraint from its authored TypeScript to a typed
 * `Constraint`: the source is lowered on the surface its space dictates,
 * typechecked against what that space may read, and checked to produce a
 * boolean.
 *
 * This module (transitively) imports `typescript`, so it stays out of
 * browser main bundles: browser callers lower through the language worker
 * (`sdcpn/lowerConstraint`), Node callers lower inline.
 */

import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import {
  buildMetricContext,
  buildScenarioExpressionContext,
} from "../hir/surface-context";
import { typecheckHir } from "../hir/typecheck";
import { CONSTRAINT_SURFACES } from "./constraint";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirDiagnostic } from "../hir/hir";
import type { Parameter, ScenarioParameter, SDCPN } from "../types/sdcpn";
import type { Constraint, ConstraintSpace } from "./constraint";

/** The authored side of a constraint: everything but its lowered form. */
export type ConstraintSource = {
  space: ConstraintSpace;
  id: string;
  name?: string;
  code: string;
};

/** What a constraint's condition ranges over, per space. */
export type LowerConstraintContext = {
  /** Net parameters, ambient as `parameters.*` on both surfaces. */
  netParameters: readonly Parameter[];
  /** The scenario parameters (`scenario.*`); parameter space only. */
  scenarioParameters: readonly ScenarioParameter[];
  /** The net the simulation `state` exposes; state space only. */
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
};

export type LowerConstraintResult =
  | { ok: true; constraint: Constraint }
  | { ok: false; diagnostics: HirDiagnostic[] };

/**
 * Lowers one constraint's source and checks that it produces a boolean.
 * Returns the constraint ready to carry, or the lowering and type
 * diagnostics (spans relative to the user's source).
 */
export function lowerConstraint(
  source: ConstraintSource,
  context: LowerConstraintContext,
): LowerConstraintResult {
  const lowered = lowerTypeScriptToHir(
    source.code,
    CONSTRAINT_SURFACES[source.space],
  );
  if (!lowered.ok) {
    return { ok: false, diagnostics: lowered.diagnostics };
  }
  const surfaceContext =
    source.space === "parameters"
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

  const authored = {
    id: source.id,
    ...(source.name === undefined ? {} : { name: source.name }),
    code: source.code,
  };
  const constraint: Constraint =
    source.space === "parameters"
      ? {
          space: "parameters",
          ...authored,
          hir: { ...lowered.fn, surface: CONSTRAINT_SURFACES.parameters },
        }
      : {
          space: "state",
          ...authored,
          hir: { ...lowered.fn, surface: CONSTRAINT_SURFACES.state },
        };
  return { ok: true, constraint };
}
