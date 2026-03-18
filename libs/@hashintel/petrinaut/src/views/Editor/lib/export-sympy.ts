import type { SDCPN } from "../../../core/types/sdcpn";
import { irToSymPy } from "../../../expression/ir-to-sympy/ir-to-sympy";
import {
  buildContextForDifferentialEquation,
  buildContextForTransition,
  compileToIR,
} from "../../../expression/ts-to-ir/compile-to-ir";

type SymPyExpression = {
  name: string;
  type: string;
  sympyCode: string | null;
  error: string | null;
};

function compileToSymPy(
  code: string,
  ctx: ReturnType<typeof buildContextForTransition>,
): { ok: true; sympyCode: string } | { ok: false; error: string } {
  const irResult = compileToIR(code, ctx);
  if (!irResult.ok) return irResult;
  return { ok: true, sympyCode: irToSymPy(irResult.ir) };
}

/**
 * Converts all expressions in an SDCPN model to SymPy and produces a JSON
 * export containing both the original model and the SymPy representations.
 */
export function exportWithSymPy({
  petriNetDefinition,
  title,
}: {
  petriNetDefinition: SDCPN;
  title: string;
}): void {
  const expressions: SymPyExpression[] = [];

  // Convert differential equation expressions
  for (const de of petriNetDefinition.differentialEquations) {
    const ctx = buildContextForDifferentialEquation(
      petriNetDefinition,
      de.colorId,
    );
    const result = compileToSymPy(de.code, ctx);
    expressions.push({
      name: de.name,
      type: "differential-equation",
      sympyCode: result.ok ? result.sympyCode : null,
      error: result.ok ? null : result.error,
    });
  }

  // Convert transition lambda and kernel expressions
  for (const transition of petriNetDefinition.transitions) {
    const lambdaCtx = buildContextForTransition(
      petriNetDefinition,
      transition,
      "Lambda",
    );
    const lambdaResult = compileToSymPy(transition.lambdaCode, lambdaCtx);
    expressions.push({
      name: `${transition.name} (lambda)`,
      type: "transition-lambda",
      sympyCode: lambdaResult.ok ? lambdaResult.sympyCode : null,
      error: lambdaResult.ok ? null : lambdaResult.error,
    });

    const kernelCtx = buildContextForTransition(
      petriNetDefinition,
      transition,
      "TransitionKernel",
    );
    const kernelResult = compileToSymPy(
      transition.transitionKernelCode,
      kernelCtx,
    );
    expressions.push({
      name: `${transition.name} (kernel)`,
      type: "transition-kernel",
      sympyCode: kernelResult.ok ? kernelResult.sympyCode : null,
      error: kernelResult.ok ? null : kernelResult.error,
    });
  }

  const exportData = {
    title,
    sympy_expressions: expressions,
    ...petriNetDefinition,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_sympy_${new Date().toISOString().replace(/:/g, "-")}.json`;

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
