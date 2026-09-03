import { HirInterpretError, interpretHir } from "../../../../hir/interpret";
import { typecheckHir } from "../../../../hir/typecheck";

import type { HirInterpretBindings, HirValue } from "../../../../hir/interpret";
import type { ScenarioHirItem } from "../../../../hir/scenario";
import type { HirSurfaceContext } from "../../../../hir/surface-context";

/**
 * One lowered scenario item after the value-independent half of its
 * evaluation. Staleness, lowering diagnostics and the type check depend only
 * on the item and the net, so they run once and each evaluation only
 * interprets.
 */
export type PreparedScenarioItem =
  | { ok: true; fn: Extract<ScenarioHirItem, { ok: true }>["fn"] }
  | { ok: false; message: string };

/** The item a scenario refers to but its lowered code does not contain. */
export const staleScenarioItem: PreparedScenarioItem = {
  ok: false,
  message:
    "This scenario code has not been compiled — the lowered scenario is stale. Recompile it from the current scenario.",
};

/**
 * Type-checks one lowered scenario item against the net, or explains why it
 * cannot run. Free of the TypeScript compiler: lowering happened elsewhere.
 */
export const prepareScenarioItem = (
  item: ScenarioHirItem | undefined,
  context: HirSurfaceContext,
): PreparedScenarioItem => {
  if (item === undefined) {
    return staleScenarioItem;
  }
  if (!item.ok) {
    return {
      ok: false,
      message: item.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("\n"),
    };
  }
  const errors = typecheckHir(item.fn, context).diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length > 0) {
    return {
      ok: false,
      message: errors.map((diagnostic) => diagnostic.message).join("\n"),
    };
  }
  return { ok: true, fn: item.fn };
};

export const interpretPreparedItem = (
  prepared: PreparedScenarioItem,
  bindings: HirInterpretBindings,
): { ok: true; value: HirValue } | { ok: false; message: string } => {
  if (!prepared.ok) {
    return prepared;
  }
  try {
    return { ok: true, value: interpretHir(prepared.fn, bindings) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof HirInterpretError || error instanceof Error
          ? error.message
          : String(error),
    };
  }
};

/** Renders an interpreted value for an error message. */
export const describeValue = (value: HirValue): string =>
  typeof value === "object" ? JSON.stringify(value) : String(value);
