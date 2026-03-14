/**
 * Python codegen module for converting SymPy expressions to JavaScript.
 *
 * The Python source is stored as a TS string constant and executed via Pyodide.
 * It defines a custom JS printer that handles SymPy RandomSymbol → Distribution.Type()
 * and a compile_expression() function for full expression evaluation.
 */

import type { PyodideInterface } from "pyodide";

/**
 * Python source code that defines the SymPy → JS compilation module.
 * Loaded into Pyodide once, then called for each expression.
 */
export const SYMPY_CODEGEN_PYTHON = `
import json
import sympy as sp
from sympy.stats import Normal, Uniform, LogNormal
from sympy.stats.crv_types import NormalDistribution, UniformDistribution, LogNormalDistribution
from sympy.stats.rv import RandomSymbol
from sympy.printing.jscode import JavascriptCodePrinter

class PetrinautJSPrinter(JavascriptCodePrinter):
    """Custom JS printer that handles SymPy RandomSymbol -> Distribution.Type()"""

    def _print_RandomSymbol(self, expr):
        # Extract the underlying distribution from the probability space
        dist = expr.pspace.distribution
        if isinstance(dist, NormalDistribution):
            mean_js = self._print(dist.mean)
            std_js = self._print(dist.std)
            return f"Distribution.Gaussian({mean_js}, {std_js})"
        elif isinstance(dist, UniformDistribution):
            left_js = self._print(dist.left)
            right_js = self._print(dist.right)
            return f"Distribution.Uniform({left_js}, {right_js})"
        elif isinstance(dist, LogNormalDistribution):
            mean_js = self._print(dist.mean)
            std_js = self._print(dist.std)
            return f"Distribution.Lognormal({mean_js}, {std_js})"
        else:
            raise ValueError(f"Unsupported distribution: {type(dist)}")

    def _print_Expr_with_random(self, expr):
        """
        Handle expressions containing RandomSymbols that didn't simplify
        to a known distribution. Decomposes into base distribution + .map().
        """
        # Find all RandomSymbol nodes in the expression tree
        random_symbols = list(expr.atoms(RandomSymbol))
        if len(random_symbols) != 1:
            raise ValueError(
                f"Expression contains {len(random_symbols)} random variables; expected exactly 1"
            )
        rs = random_symbols[0]
        # Create a dummy symbol to substitute
        x = sp.Symbol('__x__')
        # Replace the random symbol with x
        body = expr.subs(rs, x)
        # Print the base distribution
        dist_js = self._print_RandomSymbol(rs)
        # Print the body as a JS arrow function
        body_js = self._print(body).replace('__x__', 'x')
        return f"{dist_js}.map((x) => {body_js})"


def _has_random_symbol(expr):
    """Check if a SymPy expression contains any RandomSymbol."""
    if isinstance(expr, RandomSymbol):
        return True
    if hasattr(expr, 'atoms'):
        return bool(expr.atoms(RandomSymbol))
    return False


def _print_expr(printer, expr):
    """Print a single expression, handling RandomSymbol decomposition."""
    if isinstance(expr, RandomSymbol):
        return printer._print_RandomSymbol(expr)
    if _has_random_symbol(expr):
        return printer._print_Expr_with_random(expr)
    return printer.doprint(expr)


def compile_expression(sympy_code, symbols, expr_type):
    """
    Evaluate a SymPy code string and convert the result to JavaScript.

    Args:
        sympy_code: Python code string producing a SymPy expression
        symbols: list of symbol names to declare
        expr_type: "scalar" | "array-of-objects" | "dict-of-lists"

    Returns:
        JS code string (or JSON for structured types)
    """
    sym_dict = {name: sp.Symbol(name) for name in symbols}
    namespace = {
        "sp": sp,
        **sym_dict,
        "True": True,
        "False": False,
    }

    # Evaluate the SymPy code string
    expr = eval(sympy_code, namespace)
    printer = PetrinautJSPrinter()

    if expr_type == "scalar":
        return _print_expr(printer, expr)
    elif expr_type == "dict-of-lists":
        # TransitionKernel: {'PlaceName': [{'field': expr}, ...]}
        result = {}
        for place_name, token_list in expr.items():
            result[place_name] = [
                {k: _print_expr(printer, v) for k, v in token.items()}
                for token in token_list
            ]
        return json.dumps(result)
    elif expr_type == "array-of-objects":
        # Dynamics: {'field': expr} — a single per-token derivative expression.
        # The JS wrapper handles iterating over tokens at runtime.
        return json.dumps(
            {k: _print_expr(printer, v) for k, v in expr.items()}
        )
    else:
        raise ValueError(f"Unknown expr_type: {expr_type}")
`;

let codegenLoaded = false;

/**
 * Run the SymPy codegen pipeline: evaluate a SymPy expression and convert to JS code.
 *
 * @param pyodide - Initialized Pyodide instance with SymPy
 * @param sympyCode - Python code string that evaluates to a SymPy expression
 * @param symbols - Symbol names used in the expression
 * @param exprType - Expression structure type
 * @returns JavaScript code string
 */
export async function runSymPyCodegen(
  pyodide: PyodideInterface,
  sympyCode: string,
  symbols: string[],
  exprType: "scalar" | "array-of-objects" | "dict-of-lists",
): Promise<string> {
  // Load the codegen module once
  if (!codegenLoaded) {
    await pyodide.runPythonAsync(SYMPY_CODEGEN_PYTHON);
    codegenLoaded = true;
  }

  // Call compile_expression with the provided arguments
  const result = await pyodide.runPythonAsync(`
compile_expression(
    ${JSON.stringify(sympyCode)},
    ${JSON.stringify(symbols)},
    ${JSON.stringify(exprType)}
)
`);

  return result as string;
}
