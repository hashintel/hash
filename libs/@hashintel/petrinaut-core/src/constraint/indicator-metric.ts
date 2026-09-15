/**
 * A state constraint as a metric the simulation can observe: its boolean
 * body wrapped as `condition ? 1 : 0` and emitted as a buffer metric
 * program, so every run reports 1 on a frame where the condition held and 0
 * where it did not. Aggregated with `min` over a run's frames, that is the
 * "always" quantifier: 1 exactly when the condition held on every sampled
 * frame.
 *
 * The emitter imports no TypeScript compiler, so this runs on the main
 * thread; the authoring side type-checked the body already.
 */
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type PetrinautExtensionSettings,
  sanitizeSDCPNForExtensions,
} from "../extensions";
import { emitBufferMetricJs } from "../hir/emit-buffer-js";
import { walkHir } from "../hir/hir";
import { buildMetricContext } from "../hir/surface-context";

import type { HirExpr, HirFunction, HirNumberLit } from "../hir/hir";
import type { HirMetricArtifact } from "../hir/instantiate";
import type { SDCPN } from "../types/sdcpn";
import type { StateConstraint } from "./constraint";

const maxNodeId = (expr: HirExpr): number => {
  let max = -1;
  walkHir(expr, (node) => {
    max = Math.max(max, node.id);
  });
  return max;
};

/** The function's body wrapped as `body ? 1 : 0`, node ids kept unique. */
export const wrapHirAsIndicator = (fn: HirFunction): HirFunction => {
  const firstFreshId = maxNodeId(fn.body) + 1;
  const { span } = fn.body;
  const literal = (id: number, value: 0 | 1): HirNumberLit => ({
    kind: "numberLit",
    id,
    span,
    value,
    raw: String(value),
  });
  return {
    ...fn,
    body: {
      kind: "cond",
      id: firstFreshId,
      span,
      condition: fn.body,
      thenBranch: literal(firstFreshId + 1, 1),
      elseBranch: literal(firstFreshId + 2, 0),
    },
  };
};

/**
 * The constraint's indicator as a metric artifact over `sdcpn`, or null when
 * the emitter declines the body (the same shapes `compileHirArtifacts`
 * reports as not compilable).
 */
export const compileStateConstraintIndicator = (
  constraint: StateConstraint,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): HirMetricArtifact | null => {
  const context = buildMetricContext(
    sanitizeSDCPNForExtensions(sdcpn, extensions),
    extensions,
    "boolean",
  );
  const program = emitBufferMetricJs(
    wrapHirAsIndicator(constraint.hir),
    context,
  );
  return program === null
    ? null
    : { source: program.source, placeNames: program.placeNames };
};
