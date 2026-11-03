/**
 * Lowers and checks one place visualizer for the editor to interpret.
 *
 * This module (transitively) imports `typescript`, so it stays out of
 * browser main bundles: the editor lowers through the language worker
 * (`sdcpn/lowerVisualizer`). The pure side, `interpret-view.ts`, runs in the
 * editor over the result.
 */
import { checkViewHir } from "./check-view";
import { lowerViewHir } from "./lower-view";

import type { HirDiagnostic } from "../hir/hir";
import type { HirVisualizerContext } from "../hir/surface-context";
import type { ViewHir } from "./view-hir";

/**
 * A visualizer lowered and checked against its place: the view to
 * interpret, or the diagnostics that stop it. JSON-serializable, so it
 * crosses the worker boundary like `ScenarioHir`.
 */
export type VisualizerHir =
  | { ok: true; view: ViewHir }
  | { ok: false; diagnostics: HirDiagnostic[] };

/**
 * Lowers one visualizer's module and checks it against its place's colour
 * and the net's parameters. Only errors stop the picture.
 */
export const lowerVisualizerToHir = (
  code: string,
  context: HirVisualizerContext,
): VisualizerHir => {
  const lowered = lowerViewHir(code);
  if (!lowered.ok) {
    return lowered;
  }
  const errors = checkViewHir(lowered.view, context).filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  return errors.length > 0
    ? { ok: false, diagnostics: errors }
    : { ok: true, view: lowered.view };
};
