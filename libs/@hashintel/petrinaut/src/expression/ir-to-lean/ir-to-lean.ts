import type { ExpressionIR } from "../expression-ir";

const INDENT = "  ";
function pad(level: number): string {
  return INDENT.repeat(level);
}

const MATH_FN_MAP: Record<string, string> = {
  cos: "Real.cos",
  sin: "Real.sin",
  tan: "Real.tan",
  acos: "Real.arccos",
  asin: "Real.arcsin",
  atan: "Real.arctan",
  atan2: "Real.arctan2",
  sqrt: "Real.sqrt",
  log: "Real.log",
  exp: "Real.exp",
  abs: "abs",
  floor: "⌊·⌋",
  ceil: "⌈·⌉",
  min: "min",
  max: "max",
};

const MATH_CONSTANT_MAP: Record<string, string> = {
  PI: "Real.pi",
  E: "Real.exp 1",
};

const DISTRIBUTION_MAP: Record<string, { fn: string; import: string }> = {
  Gaussian: {
    fn: "gaussianReal",
    import: "Mathlib.Probability.Distributions.Gaussian",
  },
  Uniform: {
    fn: "uniformOn (Set.Icc",
    import: "Mathlib.Probability.Distributions.Uniform",
  },
  Lognormal: {
    fn: "lognormalReal",
    import: "Mathlib.Probability.Distributions.Gaussian",
  },
};

/**
 * Accumulates imports and let-bindings for clean Lean 4 output.
 */
class LeanEmitter {
  readonly imports = new Set<string>();
  readonly statements: string[] = [];
  private readonly env: Map<string, string>;

  constructor(env?: Map<string, string>) {
    this.env = new Map(env);
  }

  private addImport(module: string): void {
    this.imports.add(module);
  }

  setEnv(name: string, value: string): void {
    this.env.set(name, value);
  }

  emit(node: ExpressionIR, indent = 0): string {
    switch (node.type) {
      case "number":
        return node.value;

      case "boolean":
        return node.value ? "True" : "False";

      case "infinity": {
        this.addImport("Mathlib.Order.BoundedOrder");
        return "⊤";
      }

      case "symbol": {
        const constant = MATH_CONSTANT_MAP[node.name];
        if (constant) {
          this.addImport(
            "Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic",
          );
          return constant;
        }
        return this.env.get(node.name) ?? node.name;
      }

      case "parameter":
        return node.name;

      case "tokenAccess": {
        const index = this.emit(node.index);
        return `${node.place}_${index}_${node.field}`;
      }

      case "binary": {
        const left = this.emit(node.left, indent);
        const right = this.emit(node.right, indent);
        return this.emitBinaryOp(node.op, left, right);
      }

      case "unary": {
        const operand = this.emit(node.operand, indent);
        switch (node.op) {
          case "-":
            return `-(${operand})`;
          case "!":
            return `¬(${operand})`;
          case "+":
            return operand;
        }
        break;
      }

      case "call":
        return this.emitCall(node.fn, node.args, indent);

      case "distribution": {
        const dist = DISTRIBUTION_MAP[node.distribution];
        if (!dist) return `${node.distribution}(?)`;
        this.addImport(dist.import);
        const args = node.args.map((a) => this.emit(a, indent));
        if (node.distribution === "Uniform") {
          return `uniformOn (Set.Icc ${args[0]!} ${args[1]!})`;
        }
        return `${dist.fn} ${args.join(" ")}`;
      }

      case "derivedDistribution": {
        const dist = this.emit(node.distribution, indent);
        this.setEnv(node.variable, dist);
        return this.emit(node.body, indent);
      }

      case "piecewise": {
        const condition = this.emit(node.condition, indent);
        const whenTrue = this.emit(node.whenTrue, indent);
        const whenFalse = this.emit(node.whenFalse, indent);
        return `if ${condition} then ${whenTrue} else ${whenFalse}`;
      }

      case "array": {
        const elements = node.elements.map((e) => this.emit(e, indent));
        const flat = `[${elements.join(", ")}]`;
        if (flat.length <= 80 || elements.length <= 1) return flat;
        const inner = pad(indent + 1);
        const outer = pad(indent);
        return `[\n${inner}${elements.join(`,\n${inner}`)}\n${outer}]`;
      }

      case "object": {
        const entries = node.entries.map(
          (e) => `${e.key} := ${this.emit(e.value, indent + 1)}`,
        );
        const flat = `{ ${entries.join(", ")} }`;
        if (flat.length <= 80 || entries.length <= 1) return flat;
        const inner = pad(indent + 1);
        const outer = pad(indent);
        return `{\n${inner}${entries.join(`,\n${inner}`)}\n${outer}}`;
      }

      case "listComprehension": {
        const body = this.emit(node.body, indent);
        const collection = this.emit(node.collection, indent);
        return `${collection}.map (fun ${node.variable} => ${body})`;
      }

      case "let": {
        for (const binding of node.bindings) {
          if (binding.value.type === "distribution") {
            this.emitNamedDistribution(binding.value, binding.name);
          } else {
            const value = this.emit(binding.value, indent);
            this.statements.push(`let ${binding.name} : ℝ := ${value}`);
          }
          this.env.set(binding.name, binding.name);
        }
        return this.emit(node.body, indent);
      }

      case "propertyAccess": {
        const obj = this.emit(node.object, indent);
        return `${obj}.${node.property}`;
      }

      case "elementAccess": {
        const obj = this.emit(node.object, indent);
        const index = this.emit(node.index, indent);
        return `${obj}[${index}]!`;
      }
    }
  }

  emitNamedDistribution(
    node: ExpressionIR & { type: "distribution" },
    name: string,
  ): void {
    const dist = DISTRIBUTION_MAP[node.distribution];
    if (!dist) return;
    this.addImport(dist.import);
    const args = node.args.map((a) => this.emit(a));
    if (node.distribution === "Uniform") {
      this.statements.push(
        `let ${name} := uniformOn (Set.Icc ${args[0]!} ${args[1]!})`,
      );
    } else {
      this.statements.push(`let ${name} := ${dist.fn} ${args.join(" ")}`);
    }
  }

  private emitCall(fn: string, args: ExpressionIR[], indent: number): string {
    const compiledArgs = args.map((a) => this.emit(a, indent));

    if (fn === "hypot") {
      this.addImport("Mathlib.Analysis.SpecialFunctions.Pow.Real");
      const sumOfSquares = compiledArgs.map((a) => `(${a}) ^ 2`).join(" + ");
      return `Real.sqrt (${sumOfSquares})`;
    }

    if (fn === "pow" && compiledArgs.length === 2) {
      return `(${compiledArgs[0]!}) ^ (${compiledArgs[1]!})`;
    }

    if (fn === "floor") {
      return `⌊${compiledArgs[0]!}⌋`;
    }

    if (fn === "ceil") {
      return `⌈${compiledArgs[0]!}⌉`;
    }

    const leanFn = MATH_FN_MAP[fn];
    if (leanFn) {
      if (fn === "cos" || fn === "sin" || fn === "tan") {
        this.addImport("Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic");
      } else if (fn === "acos" || fn === "asin" || fn === "atan") {
        this.addImport(
          "Mathlib.Analysis.SpecialFunctions.Trigonometric.Inverse",
        );
      } else if (fn === "sqrt" || fn === "log" || fn === "exp") {
        this.addImport("Mathlib.Analysis.SpecialFunctions.Pow.Real");
      }
      return `${leanFn} ${compiledArgs.map((a) => `(${a})`).join(" ")}`;
    }

    return `${fn} ${compiledArgs.map((a) => `(${a})`).join(" ")}`;
  }

  private emitBinaryOp(op: string, left: string, right: string): string {
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
        return `${left} ^ ${right}`;
      case "%":
        return `${left} % ${right}`;
      case "<":
        return `${left} < ${right}`;
      case "<=":
        return `${left} ≤ ${right}`;
      case ">":
        return `${left} > ${right}`;
      case ">=":
        return `${left} ≥ ${right}`;
      case "==":
        return `${left} = ${right}`;
      case "!=":
        return `${left} ≠ ${right}`;
      case "&&":
        return `${left} ∧ ${right}`;
      case "||":
        return `${left} ∨ ${right}`;
      default:
        return `${left} ${op} ${right}`;
    }
  }

  renderImports(): string[] {
    const sorted = [...this.imports].sort();
    return sorted.map((m) => `import ${m}`);
  }
}

/**
 * Converts an expression IR node to Lean 4 code with Mathlib.
 *
 * Produces clean Lean with explicit imports, hoisted distributions,
 * and let-bindings as variable assignments.
 */
export function irToLean(
  node: ExpressionIR,
  env: Map<string, string> = new Map(),
): string {
  const emitter = new LeanEmitter(env);
  const expr = emitter.emit(node);

  const imports = emitter.renderImports();
  const parts: string[] = [];

  if (imports.length > 0) {
    parts.push(imports.join("\n"));
  }

  // Always open Real and ProbabilityTheory for cleaner code
  parts.push("open Real ProbabilityTheory");

  if (emitter.statements.length > 0) {
    parts.push(emitter.statements.join("\n"));
  }

  parts.push(`return ${expr}`);

  return parts.join("\n\n");
}
