import type { ExpressionIR } from "../expression-ir";

/** Maps IR function names to SymPy names and their `sympy` module path. */
const MATH_FN_MAP: Record<string, { name: string; module: "sympy" }> = {
  cos: { name: "cos", module: "sympy" },
  sin: { name: "sin", module: "sympy" },
  tan: { name: "tan", module: "sympy" },
  acos: { name: "acos", module: "sympy" },
  asin: { name: "asin", module: "sympy" },
  atan: { name: "atan", module: "sympy" },
  atan2: { name: "atan2", module: "sympy" },
  sqrt: { name: "sqrt", module: "sympy" },
  log: { name: "log", module: "sympy" },
  exp: { name: "exp", module: "sympy" },
  abs: { name: "Abs", module: "sympy" },
  floor: { name: "floor", module: "sympy" },
  ceil: { name: "ceiling", module: "sympy" },
  min: { name: "Min", module: "sympy" },
  max: { name: "Max", module: "sympy" },
};

const MATH_CONSTANT_MAP: Record<string, { name: string; module: "sympy" }> = {
  PI: { name: "pi", module: "sympy" },
  E: { name: "E", module: "sympy" },
};

const DISTRIBUTION_MAP: Record<
  string,
  { name: string; module: "sympy.stats" }
> = {
  Gaussian: { name: "Normal", module: "sympy.stats" },
  Uniform: { name: "Uniform", module: "sympy.stats" },
  Lognormal: { name: "LogNormal", module: "sympy.stats" },
};

/** Symbols that need `from sympy import ...` */
const SYMPY_SYMBOLS: Record<string, { name: string; module: "sympy" }> = {
  Piecewise: { name: "Piecewise", module: "sympy" },
  Mod: { name: "Mod", module: "sympy" },
  Eq: { name: "Eq", module: "sympy" },
  Ne: { name: "Ne", module: "sympy" },
  And: { name: "And", module: "sympy" },
  Or: { name: "Or", module: "sympy" },
  Not: { name: "Not", module: "sympy" },
  oo: { name: "oo", module: "sympy" },
};

const INDENT = "    ";
function pad(level: number): string {
  return INDENT.repeat(level);
}

/**
 * Accumulates top-level variable assignments and import tracking so that
 * distributions and let-bindings are hoisted out of the final expression.
 */
class SymPyEmitter {
  /** Ordered list of `name = value` assignment lines */
  readonly statements: string[] = [];
  /** Tracks imports: module → set of names */
  readonly imports = new Map<string, Set<string>>();
  private readonly env: Map<string, string>;

  constructor(env?: Map<string, string>) {
    this.env = new Map(env);
  }

  /** Create a child scope that shares the same statements list and imports. */
  child(): SymPyEmitter {
    const child = new SymPyEmitter(this.env);
    (child as { statements: string[] }).statements = this.statements;
    (child as { imports: Map<string, Set<string>> }).imports = this.imports;
    return child;
  }

  private addImport(module: string, name: string): void {
    let names = this.imports.get(module);
    if (!names) {
      names = new Set();
      this.imports.set(module, names);
    }
    names.add(name);
  }

  /** Use a sympy function/constant, registering its import. */
  private use(entry: { name: string; module: string }): string {
    this.addImport(entry.module, entry.name);
    return entry.name;
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

      case "infinity":
        return this.use(SYMPY_SYMBOLS["oo"]!);

      case "symbol": {
        const constant = MATH_CONSTANT_MAP[node.name];
        if (constant) return this.use(constant);
        return this.env.get(node.name) ?? node.name;
      }

      case "parameter":
        return node.name;

      case "tokenAccess": {
        const index = this.emit(node.index);
        return `${node.place}_${index}_${node.field}`;
      }

      case "binary": {
        const left = this.emit(node.left);
        const right = this.emit(node.right);
        return this.emitBinaryOp(node.op, left, right);
      }

      case "unary": {
        const operand = this.emit(node.operand);
        switch (node.op) {
          case "-":
            return `-(${operand})`;
          case "!":
            return `${this.use(SYMPY_SYMBOLS["Not"]!)}(${operand})`;
          case "+":
            return operand;
        }
        break;
      }

      case "call":
        return this.emitCall(node.fn, node.args);

      case "distribution": {
        // Inline: just emit the call directly (no hoisting, no symbol name)
        const dist = DISTRIBUTION_MAP[node.distribution];
        const distFn = dist ? this.use(dist) : node.distribution;
        const args = node.args.map((a) => this.emit(a));
        return `${distFn}(${args.join(", ")})`;
      }

      case "derivedDistribution": {
        const dist = this.emit(node.distribution);
        this.setEnv(node.variable, dist);
        return this.emit(node.body);
      }

      case "piecewise": {
        const pw = this.use(SYMPY_SYMBOLS["Piecewise"]!);
        const condition = this.emit(node.condition);
        const whenTrue = this.emit(node.whenTrue);
        const whenFalse = this.emit(node.whenFalse);
        return `${pw}((${whenTrue}, ${condition}), (${whenFalse}, True))`;
      }

      case "array": {
        const elements = node.elements.map((e) => this.emit(e, indent));
        const flat = `[${elements.join(", ")}]`;
        if (flat.length <= 80 || elements.length <= 1) return flat;
        const inner = pad(indent + 1);
        const outer = pad(indent);
        return `[\n${inner}${elements.join(`,\n${inner}`)},\n${outer}]`;
      }

      case "object": {
        const entries = node.entries.map(
          (e) => `'${e.key}': ${this.emit(e.value, indent + 1)}`,
        );
        const flat = `{${entries.join(", ")}}`;
        if (flat.length <= 80 || entries.length <= 1) return flat;
        const inner = pad(indent + 1);
        const outer = pad(indent);
        return `{\n${inner}${entries.join(`,\n${inner}`)},\n${outer}}`;
      }

      case "listComprehension": {
        const collection = this.emit(node.collection);
        const childEmitter = this.child();
        childEmitter.setEnv(node.variable, node.variable);
        const body = childEmitter.emit(node.body);
        return `[${body} for ${node.variable} in ${collection}]`;
      }

      case "let": {
        for (const binding of node.bindings) {
          if (binding.value.type === "distribution") {
            this.emitNamedDistribution(binding.value, binding.name);
          } else {
            const value = this.emit(binding.value);
            this.statements.push(`${binding.name} = ${value}`);
          }
          this.env.set(binding.name, binding.name);
        }
        return this.emit(node.body);
      }

      case "propertyAccess": {
        const obj = this.emit(node.object);
        return `${obj}_${node.property}`;
      }

      case "elementAccess": {
        const obj = this.emit(node.object);
        const index = this.emit(node.index);
        return `${obj}_${index}`;
      }
    }
  }

  /**
   * Emits a named distribution as a hoisted assignment.
   * Called from `let` bindings where the user gave a name.
   */
  emitNamedDistribution(
    node: ExpressionIR & { type: "distribution" },
    name: string,
  ): void {
    const dist = DISTRIBUTION_MAP[node.distribution];
    const distFn = dist ? this.use(dist) : node.distribution;
    const args = node.args.map((a) => this.emit(a));
    this.statements.push(`${name} = ${distFn}('${name}', ${args.join(", ")})`);
  }

  private emitCall(fn: string, args: ExpressionIR[]): string {
    const compiledArgs = args.map((a) => this.emit(a));

    if (fn === "hypot") {
      const sqrtFn = this.use(MATH_FN_MAP["sqrt"]!);
      const sumOfSquares = compiledArgs.map((a) => `(${a})**2`).join(" + ");
      return `${sqrtFn}(${sumOfSquares})`;
    }

    if (fn === "pow" && compiledArgs.length === 2) {
      return `(${compiledArgs[0]!})**(${compiledArgs[1]!})`;
    }

    const entry = MATH_FN_MAP[fn];
    if (entry) {
      const sympyFn = this.use(entry);
      return `${sympyFn}(${compiledArgs.join(", ")})`;
    }

    return `${fn}(${compiledArgs.join(", ")})`;
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
        return `${left}**${right}`;
      case "%":
        return `${this.use(SYMPY_SYMBOLS["Mod"]!)}(${left}, ${right})`;
      case "<":
        return `${left} < ${right}`;
      case "<=":
        return `${left} <= ${right}`;
      case ">":
        return `${left} > ${right}`;
      case ">=":
        return `${left} >= ${right}`;
      case "==":
        return `${this.use(SYMPY_SYMBOLS["Eq"]!)}(${left}, ${right})`;
      case "!=":
        return `${this.use(SYMPY_SYMBOLS["Ne"]!)}(${left}, ${right})`;
      case "&&":
        return `${this.use(SYMPY_SYMBOLS["And"]!)}(${left}, ${right})`;
      case "||":
        return `${this.use(SYMPY_SYMBOLS["Or"]!)}(${left}, ${right})`;
      default:
        return `${left} ${op} ${right}`;
    }
  }

  /** Renders collected imports as `from <module> import ...` lines. */
  renderImports(): string[] {
    const lines: string[] = [];
    // Sort modules for deterministic output
    const modules = [...this.imports.keys()].sort();
    for (const module of modules) {
      const names = [...this.imports.get(module)!].sort();
      lines.push(`from ${module} import ${names.join(", ")}`);
    }
    return lines;
  }
}

/**
 * Converts an expression IR node to SymPy Python code.
 *
 * Produces clean Python with explicit imports, hoisted distributions,
 * and let-bindings as variable assignments.
 */
export function irToSymPy(
  node: ExpressionIR,
  env: Map<string, string> = new Map(),
): string {
  const emitter = new SymPyEmitter(env);
  const expr = emitter.emit(node);

  const imports = emitter.renderImports();
  const parts: string[] = [];

  if (imports.length > 0) {
    parts.push(imports.join("\n"));
  }

  if (emitter.statements.length > 0) {
    parts.push(emitter.statements.join("\n"));
  }

  parts.push(`return ${expr}`);

  return parts.join("\n\n");
}
