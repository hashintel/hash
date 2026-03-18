import type { CompilationContext } from "./compile-to-ir";
import { compileToIR } from "./compile-to-ir";
import { irToSymPy } from "./ir-to-sympy";

// Re-export types and context builders for backward compatibility
export type { CompilationContext } from "./compile-to-ir";
export type { IRResult } from "./compile-to-ir";
export type { ExpressionIR } from "./expression-ir";
export {
  buildContextForDifferentialEquation,
  buildContextForTransition,
  compileToIR,
} from "./compile-to-ir";
export { irToSymPy } from "./ir-to-sympy";

/** @deprecated Use {@link CompilationContext} instead. */
export type SymPyCompilationContext = CompilationContext;

export type SymPyResult =
  | { ok: true; sympyCode: string }
  | { ok: false; error: string; start: number; length: number };

/**
 * Compiles a Petrinaut TypeScript expression to SymPy Python code.
 *
 * This is a convenience wrapper that composes two steps:
 * 1. TypeScript → Expression IR ({@link compileToIR})
 * 2. Expression IR → SymPy ({@link irToSymPy})
 *
 * @param code - The TypeScript expression code string
 * @param context - Compilation context with parameter names and token fields
 * @returns Either `{ ok: true, sympyCode }` or `{ ok: false, error }`
 */
export function compileToSymPy(
  code: string,
  context: CompilationContext,
): SymPyResult {
  const irResult = compileToIR(code, context);
  if (!irResult.ok) return irResult;
  return { ok: true, sympyCode: irToSymPy(irResult.ir) };
}
