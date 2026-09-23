/**
 * Prints a whole lowered function back to bare-body TypeScript.
 *
 * `printHirFunction` is the statement-level counterpart of
 * `hirExpressionToTypeScript`: root `let` chains become `const` lines,
 * conditionals whose branches carry bindings become `if` blocks, and the
 * body ends in `return`, laid out at 80 columns with 2-space indentation.
 * The text is the bare-body form of the function's surface (see
 * `user-code-form.ts`) — the statements alone, with the input object and
 * `parameters` ambient — so lowering it again with the same surface yields a
 * structurally identical tree. That lets a net document carry guards,
 * kernels and differential equations as source text.
 *
 * `substituteHirParameters` inlines known parameter values and folds the
 * constants they expose, for documents that should read as fully specified.
 */
import { foldHir } from "./analyze";
import { hirBoundNames, mapHirChildren, walkHir } from "./hir";
import { hirBodyToTypeScript } from "./print";
import { AMBIENT_INPUT_NAMES } from "./user-code-form";

import type { HirExpr, HirFunction, HirSurfaceKind } from "./hir";

export type HirParameterSubstitutions = Readonly<
  Record<string, number | boolean>
>;

export type PrintHirFunctionOptions = {
  /**
   * Parameter values to inline: every `parameters.<name>` whose name is in
   * the record prints as a literal, and the constant sub-expressions this
   * exposes are folded (`parameters.rate * 2` with `rate: 1.5` prints `3`).
   * Names absent from the record stay symbolic.
   */
  parameters?: HirParameterSubstitutions;
};

const nextHirId = (expr: HirExpr): number => {
  let highest = -1;
  walkHir(expr, (node) => {
    highest = Math.max(highest, node.id);
  });
  return highest + 1;
};

/** A literal for `value` anchored at `original`'s id and span. Non-finite
 * numbers become the `Infinity` / `NaN` constants, which is how the lowering
 * represents them (a numeric literal cannot spell them). */
const literalNode = (
  original: HirExpr,
  value: number | boolean,
  allocateId: () => number,
): HirExpr => {
  const { id, span } = original;
  if (typeof value === "boolean") {
    return { kind: "boolLit", value, id, span };
  }
  if (Number.isNaN(value)) {
    return { kind: "constant", name: "NaN", id, span };
  }
  if (value === Number.POSITIVE_INFINITY) {
    return { kind: "constant", name: "Infinity", id, span };
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return {
      kind: "unary",
      op: "-",
      operand: { kind: "constant", name: "Infinity", id: allocateId(), span },
      id,
      span,
    };
  }
  return { kind: "numberLit", value, raw: String(value), id, span };
};

/**
 * Replaces every `parameters.<name>` in `parameters` with a literal and
 * folds the constant sub-expressions that exposes. Pure: nodes it does not
 * replace keep their ids and spans, and a replacement takes the id and span
 * of the reference it stands for.
 */
export const substituteHirParameters = (
  fn: HirFunction,
  parameters: HirParameterSubstitutions,
): HirFunction => {
  let nextId = nextHirId(fn.body);
  const allocateId = (): number => {
    const id = nextId;
    nextId += 1;
    return id;
  };
  const substitute = (expr: HirExpr): HirExpr => {
    if (expr.kind === "paramRef" && Object.hasOwn(parameters, expr.name)) {
      const value = parameters[expr.name];
      return value === undefined ? expr : literalNode(expr, value, allocateId);
    }
    return mapHirChildren(expr, substitute);
  };
  const normalizeNonFinite = (expr: HirExpr): HirExpr => {
    const mapped = mapHirChildren(expr, normalizeNonFinite);
    return mapped.kind === "numberLit" && !Number.isFinite(mapped.value)
      ? literalNode(mapped, mapped.value, allocateId)
      : mapped;
  };
  return { ...fn, body: normalizeNonFinite(foldHir(substitute(fn.body))) };
};

const ambientInputName = (surface: HirSurfaceKind): string | undefined =>
  surface === "dynamics" || surface === "lambda" || surface === "kernel"
    ? AMBIENT_INPUT_NAMES[surface]
    : undefined;

/**
 * The bare-body form binds the surface's ambient input name (`input` or
 * `tokens`), so a module-form function whose first parameter was named
 * differently — or destructured — is printed with the ambient name.
 */
const withAmbientInputName = (fn: HirFunction): HirFunction => {
  const ambient = ambientInputName(fn.surface);
  const declared = fn.params[0]?.name;
  if (ambient === undefined || declared === undefined || declared === ambient) {
    return fn;
  }
  const bound = hirBoundNames(fn.body);
  if (bound.has(declared) || bound.has(ambient)) {
    throw new Error(
      `Cannot print the function body: the input parameter \`${declared}\` cannot take the ambient name \`${ambient}\` because the body rebinds one of them.`,
    );
  }
  const rename = (expr: HirExpr): HirExpr =>
    expr.kind === "localRef" && expr.name === declared
      ? { ...expr, name: ambient }
      : mapHirChildren(expr, rename);
  return {
    ...fn,
    params: fn.params.map((param, index) =>
      index === 0 ? { ...param, name: ambient } : param,
    ),
    body: rename(fn.body),
  };
};

/**
 * Prints a lowered function as the bare-body form of its surface: `const`
 * lines for root `let` bindings, `if` blocks for conditionals whose branches
 * carry bindings, and a final `return`, at 80 columns with 2-space
 * indentation and no trailing newline. Lowering the text again with
 * `fn.surface` yields a tree structurally identical to `fn` (ignoring ids and
 * spans), and printing is idempotent.
 *
 * Throws for the shapes `hirExpressionToTypeScript` rejects.
 */
export const printHirFunction = (
  fn: HirFunction,
  options: PrintHirFunctionOptions = {},
): string => {
  const substituted = options.parameters
    ? substituteHirParameters(fn, options.parameters)
    : fn;
  return hirBodyToTypeScript(withAmbientInputName(substituted).body);
};
