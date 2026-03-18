import { use, useMemo } from "react";

import type { Transition } from "../core/types/sdcpn";
import { SDCPNContext } from "../state/sdcpn-context";
import { UserSettingsContext } from "../state/user-settings-context";
import { irToLean } from "./ir-to-lean/ir-to-lean";
import { irToOCaml } from "./ir-to-ocaml/ir-to-ocaml";
import { irToSymPy } from "./ir-to-sympy/ir-to-sympy";
import {
  buildContextForTransition,
  compileToIR,
} from "./ts-to-ir/compile-to-ir";

export type ExpressionOutputFormat = "ir" | "sympy" | "ocaml" | "lean";

export type ExpressionOutput = {
  ir: string;
  sympy: string;
  ocaml: string;
  lean: string;
};

/**
 * Compiles a transition's code to expression IR and SymPy, returning
 * both formatted strings, or `null` when the setting is disabled.
 */
export function useExpressionOutput(
  transition: Transition,
  constructorFnName: "Lambda" | "TransitionKernel",
): ExpressionOutput | null {
  const { showExpressionOutput } = use(UserSettingsContext);
  const { petriNetDefinition } = use(SDCPNContext);

  const code =
    constructorFnName === "Lambda"
      ? transition.lambdaCode
      : transition.transitionKernelCode;

  return useMemo(() => {
    if (!showExpressionOutput) return null;

    const ctx = buildContextForTransition(
      petriNetDefinition,
      transition,
      constructorFnName,
    );
    const result = compileToIR(code, ctx);
    if (result.ok) {
      return {
        ir: JSON.stringify(result.ir, null, 2),
        sympy: irToSymPy(result.ir),
        ocaml: irToOCaml(result.ir),
        lean: irToLean(result.ir),
      };
    }
    const errorJson = JSON.stringify(
      { error: result.error, start: result.start, length: result.length },
      null,
      2,
    );
    return {
      ir: errorJson,
      sympy: `# Error: ${result.error}`,
      ocaml: `(* Error: ${result.error} *)`,
      lean: `-- Error: ${result.error}`,
    };
  }, [
    showExpressionOutput,
    petriNetDefinition,
    transition,
    constructorFnName,
    code,
  ]);
}
