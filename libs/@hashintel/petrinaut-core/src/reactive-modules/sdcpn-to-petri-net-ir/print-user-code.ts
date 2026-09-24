import { mapHirChildren } from "../../hir/hir";
import {
  printHirFunction,
  substituteHirParameters,
} from "../../hir/print-function";

import type { HirExpr, HirFunction } from "../../hir/hir";

/**
 * Prints a transition's or an equation's lowered code as the IR carries it:
 * bare-body TypeScript with the net's parameters inlined and every place
 * named as the IR names it, so the document is self-contained.
 */

/** The result of a kernel: a record keyed by output place, under its lets and branches. */
const renameResult = (
  expr: HirExpr,
  rename: (node: HirExpr) => HirExpr,
  placeNames: ReadonlyMap<string, string>,
): HirExpr => {
  switch (expr.kind) {
    case "let":
      return {
        ...expr,
        bindings: expr.bindings.map((binding) => ({
          ...binding,
          value: rename(binding.value),
        })),
        body: renameResult(expr.body, rename, placeNames),
      };
    case "cond":
      return {
        ...expr,
        condition: rename(expr.condition),
        thenBranch: renameResult(expr.thenBranch, rename, placeNames),
        elseBranch: renameResult(expr.elseBranch, rename, placeNames),
      };
    case "recordLit":
      return {
        ...expr,
        entries: expr.entries.map((entry) => ({
          ...entry,
          key: placeNames.get(entry.key) ?? entry.key,
          value: rename(entry.value),
        })),
      };
    default:
      return rename(expr);
  }
};

/**
 * Renames the places the code reads (`input.<Place>`) and, in a kernel, the
 * places it writes (the keys of its result record) from the model's display
 * names to the IR's names.
 */
export const renamePlacesInHir = (
  fn: HirFunction,
  placeNames: ReadonlyMap<string, string>,
): HirFunction => {
  const inputName = fn.params[0]?.name;
  const rename = (expr: HirExpr): HirExpr => {
    if (
      expr.kind === "fieldAccess" &&
      expr.target.kind === "localRef" &&
      expr.target.name === inputName
    ) {
      const irName = placeNames.get(expr.field);
      return irName === undefined ? expr : { ...expr, field: irName };
    }
    return mapHirChildren(expr, rename);
  };
  return {
    ...fn,
    body:
      fn.surface === "kernel"
        ? renameResult(fn.body, rename, placeNames)
        : rename(fn.body),
  };
};

export type PrintUserCodeOutcome =
  /** The text, and the tree it prints: parameters inlined, places renamed. */
  { ok: true; code: string; fn: HirFunction } | { ok: false; message: string };

export const printUserCode = (
  fn: HirFunction,
  placeNames: ReadonlyMap<string, string>,
  parameters: Readonly<Record<string, number | boolean>>,
): PrintUserCodeOutcome => {
  try {
    const inlined = substituteHirParameters(
      renamePlacesInHir(fn, placeNames),
      parameters,
    );
    return { ok: true, code: printHirFunction(inlined), fn: inlined };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
