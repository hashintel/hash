import { lowerTypeScriptToHir } from "./lower-typescript";
import { hirExpressionToTypeScript } from "./print";

/**
 * Formats a cell expression by lowering and printing it: canonical spacing,
 * minimal parentheses, preserved numeric literals. Returns null when the
 * code does not lower, or when the tree has no faithful single-expression
 * form — callers keep the user's text untouched in that case.
 *
 * Apart from the printer because lowering needs the TypeScript compiler,
 * which the browser-facing entries must not reach.
 */
export function formatTypeScriptExpression(code: string): string | null {
  const lowered = lowerTypeScriptToHir(code, "scenario-expression");
  if (!lowered.ok) {
    return null;
  }
  try {
    return hirExpressionToTypeScript(lowered.fn.body);
  } catch {
    return null;
  }
}
