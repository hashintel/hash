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

import { AMBIENT_INPUT_NAMES, type DualFormSurfaceKind } from "./ambient-names";

export { AMBIENT_INPUT_NAMES, type DualFormSurfaceKind };

export type UserCodeForm = "module" | "body";

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
