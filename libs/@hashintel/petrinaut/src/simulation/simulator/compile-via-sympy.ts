/**
 * Orchestrates the full TypeScript → SymPy → JavaScript compilation pipeline.
 *
 * 1. Compile user TypeScript to SymPy Python code (compile-to-sympy.ts)
 * 2. Run SymPy via Pyodide to evaluate and simplify the expression
 * 3. Convert back to JavaScript using custom printer (sympy-codegen.ts)
 * 4. Wrap into an executable JS function with runtime argument unpacking
 */

import type { PyodideInterface } from "pyodide";

import type { SDCPN } from "../../core/types/sdcpn";
import {
  buildContextForDifferentialEquation,
  buildContextForTransition,
  compileToSymPy,
  type SymPyCompilationContext,
} from "./compile-to-sympy";
import { distributionRuntimeCode } from "./distribution";
import { runSymPyCodegen } from "./sympy-codegen";

/**
 * Expression type determines how the SymPy result is structured:
 * - "scalar": single value (Lambda functions)
 * - "array-of-objects": array of {field: expr} objects (Dynamics)
 * - "dict-of-lists": {PlaceName: [{field: expr}, ...]} (TransitionKernel)
 */
type ExprType = "scalar" | "array-of-objects" | "dict-of-lists";

/**
 * Determine the expression type from the constructor function name.
 */
function exprTypeForConstructor(constructorFnName: string): ExprType {
  switch (constructorFnName) {
    case "Lambda":
      return "scalar";
    case "Dynamics":
      return "array-of-objects";
    case "TransitionKernel":
      return "dict-of-lists";
    default:
      return "scalar";
  }
}

/**
 * Build the JavaScript function preamble that unpacks runtime arguments
 * into the symbol names used by the SymPy-generated JS expression.
 *
 * For Lambda/TransitionKernel (tokens by place):
 *   var Space_0_x = tokens["Space"][0]["x"];
 *   var infection_rate = parameters["infection_rate"];
 *
 * For Dynamics (flat token array):
 *   var x = tokens[0]["x"];
 *   var infection_rate = parameters["infection_rate"];
 */
function buildUnpackingPreamble(
  context: SymPyCompilationContext,
  usedSymbols: string[],
  mode: "outer" | "per-token" = "outer",
): string {
  const lines: string[] = [];

  for (const sym of usedSymbols) {
    // Check if this symbol is a parameter
    if (context.parameterNames.has(sym)) {
      lines.push(`var ${sym} = parameters[${JSON.stringify(sym)}];`);
      continue;
    }

    // For Dynamics per-token mode: _iter_fieldName → __token__["fieldName"]
    if (mode === "per-token") {
      const iterMatch = sym.match(/^_iter_(.+)$/);
      if (iterMatch) {
        const fieldName = iterMatch[1]!;
        lines.push(`var ${sym} = __token__[${JSON.stringify(fieldName)}];`);
        continue;
      }
      // _iter (simple param, not destructured) → __token__
      if (sym === "_iter") {
        lines.push(`var _iter = __token__;`);
        continue;
      }
    }

    // Check if this is a token field symbol: PlaceName_index_fieldName
    let matched = false;
    for (const [placeName, fields] of context.placeTokenFields) {
      for (const field of fields) {
        // Match patterns like Space_0_x, Space_1_velocity
        const pattern = new RegExp(`^${placeName}_(\\d+)_${field}$`);
        const match = sym.match(pattern);
        if (match) {
          const index = match[1];
          if (context.constructorFnName === "Dynamics") {
            // Dynamics: tokens is a flat array of token objects
            lines.push(
              `var ${sym} = tokens[${index}][${JSON.stringify(field)}];`,
            );
          } else {
            // Lambda/TransitionKernel: tokens is {PlaceName: [token, ...]}
            lines.push(
              `var ${sym} = tokens[${JSON.stringify(placeName)}][${index}][${JSON.stringify(field)}];`,
            );
          }
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  return lines.join("\n");
}

/**
 * Build the Distribution namespace object for runtime use in generated functions.
 * Reuses the same runtime code from distribution.ts.
 */
function buildDistributionNamespace(): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function(`${distributionRuntimeCode}\nreturn Distribution;`)();
}

/**
 * Build a JS function string from SymPy-generated JS code and wrap it
 * so it can be called with (tokens, parameters) arguments.
 */
function buildJsFunction(
  jsCode: string,
  context: SymPyCompilationContext,
  usedSymbols: string[],
  exprType: ExprType,
): (...args: unknown[]) => unknown {
  const preamble = buildUnpackingPreamble(context, usedSymbols);

  let body: string;

  if (exprType === "scalar") {
    // scalar: jsCode is a single expression
    body = `${preamble}\nreturn ${jsCode};`;
  } else if (exprType === "array-of-objects") {
    // Dynamics: jsCode is a JSON string of {field: "expr"} for a SINGLE token.
    // The SymPy code represents the per-token derivative expression.
    // We wrap it in a tokens.map() to apply it to all tokens at runtime.
    const parsed = JSON.parse(jsCode) as Record<string, string>;
    const perTokenPreamble = buildUnpackingPreamble(
      context,
      usedSymbols,
      "per-token",
    );
    const entries = Object.entries(parsed)
      .map(([key, expr]) => `${JSON.stringify(key)}: ${expr}`)
      .join(", ");
    body = `${preamble}\nreturn tokens.map(function(__token__) {\n  ${perTokenPreamble}\n  return {${entries}};\n});`;
  } else {
    // dict-of-lists: jsCode is a JSON string of {PlaceName: [{field: "expr"}, ...]}
    const parsed = JSON.parse(jsCode) as Record<
      string,
      Record<string, string>[]
    >;
    const entries = Object.entries(parsed)
      .map(([placeName, tokens]) => {
        const tokenArray = tokens
          .map((token) => {
            const fields = Object.entries(token)
              .map(([key, expr]) => `${JSON.stringify(key)}: ${expr}`)
              .join(", ");
            return `{${fields}}`;
          })
          .join(", ");
        return `${JSON.stringify(placeName)}: [${tokenArray}]`;
      })
      .join(",\n    ");
    body = `${preamble}\nreturn {${entries}};`;
  }

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  return new Function("Distribution", "tokens", "parameters", body).bind(
    null,
    buildDistributionNamespace(),
  ) as (...args: unknown[]) => unknown;
}

/**
 * Compile user TypeScript code via the SymPy pipeline.
 *
 * @param code - User TypeScript code (e.g., `export default Lambda((tokens, params) => ...)`)
 * @param constructorFnName - "Lambda" | "Dynamics" | "TransitionKernel"
 * @param context - Compilation context with parameter names and token fields
 * @param pyodide - Initialized Pyodide instance with SymPy
 * @returns Compiled JS function ready for execution
 */
export async function compileUserCodeViaSymPy<T extends unknown[] = unknown[]>(
  code: string,
  constructorFnName: string,
  context: SymPyCompilationContext,
  pyodide: PyodideInterface,
): Promise<(...args: T) => unknown> {
  // Step 1: TypeScript → SymPy Python code
  const sympyResult = compileToSymPy(code, context);

  if (!sympyResult.ok) {
    throw new Error(sympyResult.error);
  }

  const { sympyCode, symbols } = sympyResult;
  const exprType = exprTypeForConstructor(constructorFnName);

  // Step 2: Run SymPy via Pyodide → JavaScript code string
  const jsCode = await runSymPyCodegen(pyodide, sympyCode, symbols, exprType);

  // Step 3: Build executable JS function
  return buildJsFunction(jsCode, context, symbols, exprType) as (
    ...args: T
  ) => unknown;
}

/**
 * Build a SymPyCompilationContext and compile user code for a differential equation.
 */
export async function compileDifferentialEquationViaSymPy(
  code: string,
  sdcpn: SDCPN,
  colorId: string,
  pyodide: PyodideInterface,
): Promise<(...args: unknown[]) => unknown> {
  const context = buildContextForDifferentialEquation(sdcpn, colorId);
  return compileUserCodeViaSymPy(code, "Dynamics", context, pyodide);
}

/**
 * Build a SymPyCompilationContext and compile user code for a lambda function.
 */
export async function compileLambdaViaSymPy(
  code: string,
  sdcpn: SDCPN,
  transition: SDCPN["transitions"][0],
  pyodide: PyodideInterface,
): Promise<(...args: unknown[]) => unknown> {
  const context = buildContextForTransition(sdcpn, transition, "Lambda");
  return compileUserCodeViaSymPy(code, "Lambda", context, pyodide);
}

/**
 * Build a SymPyCompilationContext and compile user code for a transition kernel.
 */
export async function compileTransitionKernelViaSymPy(
  code: string,
  sdcpn: SDCPN,
  transition: SDCPN["transitions"][0],
  pyodide: PyodideInterface,
): Promise<(...args: unknown[]) => unknown> {
  const context = buildContextForTransition(
    sdcpn,
    transition,
    "TransitionKernel",
  );
  return compileUserCodeViaSymPy(code, "TransitionKernel", context, pyodide);
}
