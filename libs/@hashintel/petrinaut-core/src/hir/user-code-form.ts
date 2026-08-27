/**
 * Source-form detection for dynamics/lambda/kernel user code.
 *
 * These surfaces accept two source forms:
 *
 * - **module** — `export default <Ctor>((tokens, parameters) => …)`, the
 *   original authoring style;
 * - **body** — a bare function body ending in `return`, with the input
 *   (`tokens` / `input`) and `parameters` available ambiently, like
 *   metric and scenario code.
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
import ts from "typescript";

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
 * every bare body.
 */
export const AMBIENT_INPUT_NAMES: Record<DualFormSurfaceKind, string> = {
  dynamics: "tokens",
  lambda: "input",
  kernel: "input",
};

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
 * Classifies dynamics/lambda/kernel user code as the module form or the
 * bare-body form. Tolerant of syntax errors — the parser still produces
 * statements for broken code, and downstream lowering / type checking reports
 * the errors for whichever form was detected.
 */
export function detectUserCodeForm(code: string): UserCodeForm {
  const sourceFile = ts.createSourceFile(
    "detect-form.ts",
    code,
    ts.ScriptTarget.ES2020,
  );
  return sourceFile.statements.some(isExportStatement) ? "module" : "body";
}
