import { analyzeHir } from "../../hir/analyze";
import { interpretHir, type HirValue } from "../../hir/interpret";

import type { HirFunction } from "../../hir/hir";

export type StaticLambdaOutcome =
  | { ok: true; value: HirValue }
  | {
      ok: false;
      code: "lambda-reads-input" | "lambda-not-static" | "lambda-failed";
      message: string;
    };

/**
 * Evaluates a transition's lowered condition to one value, given the net
 * parameter values. The IR holds no code, so a condition that reads its
 * input tokens or draws random numbers has no value to bake in and is
 * refused with the reason.
 */
export const evaluateStaticLambda = (
  fn: HirFunction,
  parameters: Readonly<Record<string, number | boolean>>,
): StaticLambdaOutcome => {
  const { dependencies } = analyzeHir(fn);
  if (dependencies.tokenReads.length > 0 || dependencies.readsTokenCounts) {
    return {
      ok: false,
      code: "lambda-reads-input",
      message:
        "the condition reads its input tokens, so it has no single value to bake into the net",
    };
  }
  if (!dependencies.isDeterministic) {
    return {
      ok: false,
      code: "lambda-not-static",
      message:
        "the condition draws random values, so it has no single value to bake into the net",
    };
  }
  try {
    return { ok: true, value: interpretHir(fn, { parameters, scenario: {} }) };
  } catch (error) {
    return {
      ok: false,
      code: "lambda-failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
