import type { ExpressionIR } from "./expression-ir";

const MATH_FN_MAP: Record<string, string> = {
  cos: "sp.cos",
  sin: "sp.sin",
  tan: "sp.tan",
  acos: "sp.acos",
  asin: "sp.asin",
  atan: "sp.atan",
  atan2: "sp.atan2",
  sqrt: "sp.sqrt",
  log: "sp.log",
  exp: "sp.exp",
  abs: "sp.Abs",
  floor: "sp.floor",
  ceil: "sp.ceiling",
  min: "sp.Min",
  max: "sp.Max",
};

const MATH_CONSTANT_MAP: Record<string, string> = {
  PI: "sp.pi",
  E: "sp.E",
};

const DISTRIBUTION_MAP: Record<string, string> = {
  Gaussian: "sp.stats.Normal",
  Uniform: "sp.stats.Uniform",
  Lognormal: "sp.stats.LogNormal",
};

/**
 * Converts an expression IR node to SymPy Python code.
 *
 * Let-bindings are inlined: the binding's value replaces all references
 * to the binding name in the body expression.
 */
export function irToSymPy(
  node: ExpressionIR,
  env: Map<string, string> = new Map(),
): string {
  switch (node.type) {
    case "number":
      return node.value;

    case "boolean":
      return node.value ? "True" : "False";

    case "infinity":
      return "sp.oo";

    case "symbol": {
      const constant = MATH_CONSTANT_MAP[node.name];
      if (constant) return constant;
      return env.get(node.name) ?? node.name;
    }

    case "parameter":
      return node.name;

    case "tokenAccess": {
      const index = irToSymPy(node.index, env);
      return `${node.place}_${index}_${node.field}`;
    }

    case "binary": {
      const left = irToSymPy(node.left, env);
      const right = irToSymPy(node.right, env);
      return emitBinaryOp(node.op, left, right);
    }

    case "unary": {
      const operand = irToSymPy(node.operand, env);
      switch (node.op) {
        case "-":
          return `-(${operand})`;
        case "!":
          return `sp.Not(${operand})`;
        case "+":
          return operand;
      }
      break;
    }

    case "call":
      return emitCall(node.fn, node.args, env);

    case "distribution": {
      const distFn = DISTRIBUTION_MAP[node.distribution];
      const args = node.args.map((a) => irToSymPy(a, env));
      return `${distFn}('X', ${args.join(", ")})`;
    }

    case "derivedDistribution": {
      const dist = irToSymPy(node.distribution, env);
      const localEnv = new Map(env);
      localEnv.set(node.variable, node.variable);
      const body = irToSymPy(node.body, localEnv);
      return `DerivedDistribution(${dist}, lambda ${node.variable}: ${body})`;
    }

    case "piecewise": {
      const condition = irToSymPy(node.condition, env);
      const whenTrue = irToSymPy(node.whenTrue, env);
      const whenFalse = irToSymPy(node.whenFalse, env);
      return `sp.Piecewise((${whenTrue}, ${condition}), (${whenFalse}, True))`;
    }

    case "array": {
      const elements = node.elements.map((e) => irToSymPy(e, env));
      return `[${elements.join(", ")}]`;
    }

    case "object": {
      const entries = node.entries.map(
        (e) => `'${e.key}': ${irToSymPy(e.value, env)}`,
      );
      return `{${entries.join(", ")}}`;
    }

    case "listComprehension": {
      const body = irToSymPy(node.body, env);
      const collection = irToSymPy(node.collection, env);
      return `[${body} for ${node.variable} in ${collection}]`;
    }

    case "let": {
      const localEnv = new Map(env);
      for (const binding of node.bindings) {
        localEnv.set(binding.name, irToSymPy(binding.value, localEnv));
      }
      return irToSymPy(node.body, localEnv);
    }

    case "propertyAccess": {
      const obj = irToSymPy(node.object, env);
      return `${obj}_${node.property}`;
    }

    case "elementAccess": {
      const obj = irToSymPy(node.object, env);
      const index = irToSymPy(node.index, env);
      return `${obj}_${index}`;
    }
  }
}

function emitBinaryOp(op: string, left: string, right: string): string {
  switch (op) {
    case "+":
      return `${left} + ${right}`;
    case "-":
      return `${left} - ${right}`;
    case "*":
      return `${left} * ${right}`;
    case "/":
      return `${left} / ${right}`;
    case "**":
      return `${left}**${right}`;
    case "%":
      return `sp.Mod(${left}, ${right})`;
    case "<":
      return `${left} < ${right}`;
    case "<=":
      return `${left} <= ${right}`;
    case ">":
      return `${left} > ${right}`;
    case ">=":
      return `${left} >= ${right}`;
    case "==":
      return `sp.Eq(${left}, ${right})`;
    case "!=":
      return `sp.Ne(${left}, ${right})`;
    case "&&":
      return `sp.And(${left}, ${right})`;
    case "||":
      return `sp.Or(${left}, ${right})`;
    default:
      return `${left} ${op} ${right}`;
  }
}

function emitCall(
  fn: string,
  args: ExpressionIR[],
  env: Map<string, string>,
): string {
  const compiledArgs = args.map((a) => irToSymPy(a, env));

  // Math.hypot(a, b) → sp.sqrt(a**2 + b**2)
  if (fn === "hypot") {
    const sumOfSquares = compiledArgs.map((a) => `(${a})**2`).join(" + ");
    return `sp.sqrt(${sumOfSquares})`;
  }

  // Math.pow(a, b) → a**b
  if (fn === "pow" && compiledArgs.length === 2) {
    return `(${compiledArgs[0]!})**(${compiledArgs[1]!})`;
  }

  const sympyFn = MATH_FN_MAP[fn];
  if (sympyFn) {
    return `${sympyFn}(${compiledArgs.join(", ")})`;
  }

  return `${fn}(${compiledArgs.join(", ")})`;
}
