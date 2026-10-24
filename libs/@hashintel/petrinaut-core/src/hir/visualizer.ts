/**
 * Lowering of a place visualizer into serializable HIR.
 *
 * This module (transitively) imports `typescript`, so it stays out of
 * browser main bundles: the editor lowers through the language worker
 * (`sdcpn/lowerVisualizer`). The pure side, interpreting the tree and
 * rendering the element values, lives in the UI package.
 */
import { lowerTypeScriptToHir } from "./lower-typescript";
import { typecheckHir } from "./typecheck";

import type { HirDiagnostic, HirFunction } from "./hir";
import type { HirVisualizerContext } from "./surface-context";

/**
 * A visualizer lowered and checked against its place: the function to
 * interpret, or the diagnostics that stop it. JSON-serializable, so it
 * crosses the worker boundary like `ScenarioHir`.
 */
export type VisualizerHir =
  | { ok: true; fn: HirFunction }
  | { ok: false; diagnostics: HirDiagnostic[] };

/**
 * Lowers one visualizer's module and checks it against its place's colour
 * and the net's parameters. Warnings and hints are left to the editor's
 * lint; only errors stop the picture.
 */
export const lowerVisualizerToHir = (
  code: string,
  context: HirVisualizerContext,
): VisualizerHir => {
  const lowered = lowerTypeScriptToHir(code, "visualizer");
  if (!lowered.ok) {
    return { ok: false, diagnostics: lowered.diagnostics };
  }
  const errors = typecheckHir(lowered.fn, context).diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  return errors.length > 0
    ? { ok: false, diagnostics: errors }
    : { ok: true, fn: lowered.fn };
};
