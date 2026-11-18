/**
 * Source-form detection for dynamics/lambda/kernel/visualizer user code.
 *
 * These surfaces accept two source forms:
 *
 * - **module** — `export default <Ctor>((tokens, parameters) => …)`, the
 *   original authoring style;
 * - **body** — a bare function body ending in `return`, with the input
 *   (`token` / `tokens` / `input`) and `parameters` available ambiently,
 *   like metric and scenario code.
 *
 * The HIR lowering and the LSP's virtual-file wrapping must agree on which
 * form a given piece of code is in, so the decision lives here and nowhere
 * else: any top-level `export` (a default export, `export =`, an export
 * declaration, or an exported statement) marks the module form; everything
 * else is a body. Detection parses statements rather than scanning text so
 * comments mentioning `export default` cannot flip the result, and so module
 * attempts with stray statements still route to the module path's clearer
 * "only `export default <Ctor>(...)`" diagnostics.
 */
import ts from "@typescript/typescript6";

import type { HirSurfaceKind } from "./hir";

/** Surfaces whose code may be either an `export default <Ctor>(...)` module
 * or a bare function body (metric and scenario surfaces are bare-body only). */
export type DualFormSurfaceKind = Extract<
  HirSurfaceKind,
  "dynamics" | "lambda" | "kernel"
>;

export type UserCodeForm = "module" | "body";

/**
 * Ambient input-object names for the bare-body form — the names the docs
 * teach and the LSP's body wrapper declares. `parameters` is ambient in
 * every bare body. An equation that couples one token sees `token` instead
 * of the `tokens` tuple: see {@link dynamicsInputName}.
 */
export const AMBIENT_INPUT_NAMES: Record<DualFormSurfaceKind, string> = {
  dynamics: "tokens",
  lambda: "input",
  kernel: "input",
};

/** The ambient name of the one token an equation of arity 1 couples. */
export const SINGLE_TOKEN_INPUT_NAME = "token";

/**
 * The ambient input name of an equation's bare body: `token`, the token
 * itself, for an equation that couples one; `tokens`, the tuple, for one
 * that couples more.
 */
export const dynamicsInputName = (arity: number | undefined): string =>
  arity === 1 ? SINGLE_TOKEN_INPUT_NAME : AMBIENT_INPUT_NAMES.dynamics;

function isExportStatement(statement: ts.Statement): boolean {
  if (ts.isExportAssignment(statement) || ts.isExportDeclaration(statement)) {
    return true;
  }
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

/**
 * Classifies user code as the module form or the
 * bare-body form. Tolerant of syntax errors — the parser still produces
 * statements for broken code, and downstream lowering / type checking reports
 * the errors for whichever form was detected.
 */
export function detectUserCodeForm(
  code: string | ts.SourceFile,
  scriptKind = ts.ScriptKind.TS,
): UserCodeForm {
  const sourceFile =
    typeof code === "string"
      ? ts.createSourceFile(
          "detect-form.ts",
          code,
          ts.ScriptTarget.ES2020,
          false,
          scriptKind,
        )
      : code;
  return sourceFile.statements.some(isExportStatement) ? "module" : "body";
}

export const getStateConstraintExpression = (
  code: string,
): string | undefined => {
  const sourceFile = ts.createSourceFile(
    "constraint-form.ts",
    code,
    ts.ScriptTarget.ES2020,
  );
  if (
    sourceFile.statements.length > 1 ||
    sourceFile.statements.some(
      (statement) => !ts.isExpressionStatement(statement),
    )
  ) {
    return undefined;
  }
  const statement = sourceFile.statements.at(-1);
  if (statement && code[statement.end - 1] === ";") {
    // Preserve source offsets when wrapping the expression for compilation and LSP.
    return `${code.slice(0, statement.end - 1)} ${code.slice(statement.end)}`;
  }
  return code;
};

/** State constraints accept expressions and existing bodies with explicit returns. */
export const detectStateConstraintForm = (
  code: string,
): "expression" | "body" =>
  getStateConstraintExpression(code) === undefined ? "body" : "expression";
