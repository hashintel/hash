import type { ExpressionIR } from "../expression-ir";

const INDENT = "  ";
function pad(level: number): string {
  return INDENT.repeat(level);
}

const MATH_FN_MAP: Record<string, string> = {
  cos: "Float.cos",
  sin: "Float.sin",
  tan: "Float.tan",
  acos: "Float.acos",
  asin: "Float.asin",
  atan: "Float.atan",
  atan2: "Float.atan2",
  sqrt: "Float.sqrt",
  log: "Float.log",
  exp: "Float.exp",
  abs: "Float.abs",
  floor: "Float.round ~dir:`Down",
  ceil: "Float.round ~dir:`Up",
  min: "Float.min",
  max: "Float.max",
};

const MATH_CONSTANT_MAP: Record<string, string> = {
  PI: "Float.pi",
  E: "Float.(exp 1.0)",
};

const DISTRIBUTION_MAP: Record<string, string> = {
  Gaussian: "Distribution.gaussian",
  Uniform: "Distribution.uniform",
  Lognormal: "Distribution.lognormal",
};

/**
 * Converts an expression IR node to OCaml code.
 *
 * Let-bindings are emitted as OCaml `let ... in` expressions.
 */
export function irToOCaml(
  node: ExpressionIR,
  env: Map<string, string> = new Map(),
  indent = 0,
): string {
  switch (node.type) {
    case "number": {
      const val = node.value;
      // OCaml float literals require a dot
      return val.includes(".") ? val : `${val}.`;
    }

    case "boolean":
      return node.value ? "true" : "false";

    case "infinity":
      return "Float.infinity";

    case "symbol": {
      const constant = MATH_CONSTANT_MAP[node.name];
      if (constant) return constant;
      return env.get(node.name) ?? node.name;
    }

    case "parameter":
      return node.name;

    case "tokenAccess": {
      const index = irToOCaml(node.index, env);
      return `${node.place}_${index}_${node.field}`;
    }

    case "binary": {
      const left = irToOCaml(node.left, env);
      const right = irToOCaml(node.right, env);
      return emitBinaryOp(node.op, left, right);
    }

    case "unary": {
      const operand = irToOCaml(node.operand, env);
      switch (node.op) {
        case "-":
          return `Float.neg (${operand})`;
        case "!":
          return `not (${operand})`;
        case "+":
          return operand;
      }
      break;
    }

    case "call":
      return emitCall(node.fn, node.args, env);

    case "distribution": {
      const distFn = DISTRIBUTION_MAP[node.distribution];
      const args = node.args.map((a) => irToOCaml(a, env));
      return `${distFn} ${args.map((a) => `(${a})`).join(" ")}`;
    }

    case "derivedDistribution": {
      const dist = irToOCaml(node.distribution, env, indent);
      const localEnv = new Map(env);
      localEnv.set(node.variable, dist);
      return irToOCaml(node.body, localEnv, indent);
    }

    case "piecewise": {
      const condition = irToOCaml(node.condition, env);
      const whenTrue = irToOCaml(node.whenTrue, env);
      const whenFalse = irToOCaml(node.whenFalse, env);
      return `if ${condition} then ${whenTrue} else ${whenFalse}`;
    }

    case "array": {
      const elements = node.elements.map((e) => irToOCaml(e, env, indent));
      const flat = `[${elements.join("; ")}]`;
      if (flat.length <= 80 || elements.length <= 1) return flat;
      const inner = pad(indent + 1);
      const outer = pad(indent);
      return `[\n${inner}${elements.join(`;\n${inner}`)}\n${outer}]`;
    }

    case "object": {
      const entries = node.entries.map(
        (e) => `${e.key} = ${irToOCaml(e.value, env, indent + 1)}`,
      );
      const flat = `{ ${entries.join("; ")} }`;
      if (flat.length <= 80 || entries.length <= 1) return flat;
      const inner = pad(indent + 1);
      const outer = pad(indent);
      return `{\n${inner}${entries.join(`;\n${inner}`)}\n${outer}}`;
    }

    case "listComprehension": {
      const body = irToOCaml(node.body, env);
      const collection = irToOCaml(node.collection, env);
      return `List.map (fun ${node.variable} -> ${body}) ${collection}`;
    }

    case "let": {
      let result = "";
      const localEnv = new Map(env);
      for (const binding of node.bindings) {
        const value = irToOCaml(binding.value, localEnv);
        result += `let ${binding.name} = ${value} in\n`;
        localEnv.set(binding.name, binding.name);
      }
      result += irToOCaml(node.body, localEnv);
      return result;
    }

    case "propertyAccess": {
      const obj = irToOCaml(node.object, env);
      return `(${obj}).${node.property}`;
    }

    case "elementAccess": {
      const obj = irToOCaml(node.object, env);
      const index = irToOCaml(node.index, env);
      return `List.nth (${obj}) (${index})`;
    }
  }
}

function emitBinaryOp(op: string, left: string, right: string): string {
  switch (op) {
    case "+":
      return `(${left}) +. (${right})`;
    case "-":
      return `(${left}) -. (${right})`;
    case "*":
      return `(${left}) *. (${right})`;
    case "/":
      return `(${left}) /. (${right})`;
    case "**":
      return `(${left}) ** (${right})`;
    case "%":
      return `Float.mod_float (${left}) (${right})`;
    case "<":
      return `Float.( < ) (${left}) (${right})`;
    case "<=":
      return `Float.( <= ) (${left}) (${right})`;
    case ">":
      return `Float.( > ) (${left}) (${right})`;
    case ">=":
      return `Float.( >= ) (${left}) (${right})`;
    case "==":
      return `Float.( = ) (${left}) (${right})`;
    case "!=":
      return `Float.( <> ) (${left}) (${right})`;
    case "&&":
      return `(${left}) && (${right})`;
    case "||":
      return `(${left}) || (${right})`;
    default:
      return `(${left}) ${op} (${right})`;
  }
}

function emitCall(
  fn: string,
  args: ExpressionIR[],
  env: Map<string, string>,
): string {
  const compiledArgs = args.map((a) => irToOCaml(a, env));

  // Math.hypot(a, b) → Float.sqrt (a *. a +. b *. b)
  if (fn === "hypot") {
    const sumOfSquares = compiledArgs
      .map((a) => `(${a}) *. (${a})`)
      .join(" +. ");
    return `Float.sqrt (${sumOfSquares})`;
  }

  // Math.pow(a, b) → a ** b
  if (fn === "pow" && compiledArgs.length === 2) {
    return `(${compiledArgs[0]!}) ** (${compiledArgs[1]!})`;
  }

  const ocamlFn = MATH_FN_MAP[fn];
  if (ocamlFn) {
    return `${ocamlFn} (${compiledArgs.join(") (")})`;
  }

  return `${fn} (${compiledArgs.join(") (")})`;
}
