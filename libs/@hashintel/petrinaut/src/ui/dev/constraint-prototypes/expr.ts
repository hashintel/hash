/**
 * The expression core the constraint prototypes share: a tiny parser and
 * evaluator for the arithmetic/boolean subset the constraint surfaces use,
 * plus the two analyses the prototypes demonstrate — the signed margin of a
 * boolean expression (the robustness value the RFC calls `g`) and the
 * linear form of a numeric expression (what routes a parameter constraint
 * to a sampling mechanism).
 *
 * Prototype-only: the product lowers TypeScript to HIR through the language
 * worker; this module exists so the Storybook prototypes can re-evaluate
 * thousands of points per frame synchronously. The grammar deliberately
 * matches the product surface (dotted identifiers such as
 * `scenario.flow_rate`, `&&`/`||`, comparisons, ternaries, `min`/`max`…),
 * so anything authored here lowers through the real pipeline unchanged.
 */

export type ExprNode =
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: "!" | "-"; operand: ExprNode }
  | { kind: "binary"; op: BinaryOp; left: ExprNode; right: ExprNode }
  | {
      kind: "cond";
      condition: ExprNode;
      whenTrue: ExprNode;
      whenFalse: ExprNode;
    }
  | { kind: "call"; name: string; args: ExprNode[] };

export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||";

export class ExprError extends Error {
  readonly index: number;

  constructor(message: string, index: number) {
    super(message);
    this.name = "ExprError";
    this.index = index;
  }
}

type Token =
  | { kind: "number"; value: number; index: number }
  | { kind: "ident"; name: string; index: number }
  | { kind: "punct"; text: string; index: number };

const PUNCTUATION = [
  "&&",
  "||",
  "<=",
  ">=",
  "==",
  "!=",
  "(",
  ")",
  ",",
  "?",
  ":",
  "!",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  outer: while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (
      /[0-9]/.test(char) ||
      (char === "." && /[0-9]/.test(source[index + 1] ?? ""))
    ) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(
        source.slice(index),
      )!;
      tokens.push({ kind: "number", value: Number(match[0]), index });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match =
        /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/.exec(
          source.slice(index),
        )!;
      tokens.push({ kind: "ident", name: match[0], index });
      index += match[0].length;
      continue;
    }
    for (const punct of PUNCTUATION) {
      if (source.startsWith(punct, index)) {
        tokens.push({ kind: "punct", text: punct, index });
        index += punct.length;
        continue outer;
      }
    }
    throw new ExprError(`Unexpected character "${char}"`, index);
  }
  return tokens;
}

/** Binding power per binary operator; higher binds tighter. */
const BINDING_POWER: Record<BinaryOp, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

export function parseExpression(source: string): ExprNode {
  const tokens = tokenize(source);
  let position = 0;

  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (text: string) => {
    const token = take();
    if (token?.kind !== "punct" || token.text !== text) {
      throw new ExprError(`Expected "${text}"`, token?.index ?? source.length);
    }
  };

  function parsePrimary(): ExprNode {
    const token = take();
    if (!token) {
      throw new ExprError("Unexpected end of expression", source.length);
    }
    if (token.kind === "number") {
      return { kind: "number", value: token.value };
    }
    if (token.kind === "ident") {
      if (token.name === "true" || token.name === "false") {
        return { kind: "boolean", value: token.name === "true" };
      }
      const next = peek();
      if (next?.kind === "punct" && next.text === "(") {
        take();
        const args: ExprNode[] = [];
        const closing = peek();
        if (!(closing?.kind === "punct" && closing.text === ")")) {
          for (;;) {
            // eslint-disable-next-line no-use-before-define -- mutual recursion
            args.push(parseTernary());
            const separator = peek();
            if (separator?.kind === "punct" && separator.text === ",") {
              take();
              continue;
            }
            break;
          }
        }
        expect(")");
        return { kind: "call", name: token.name, args };
      }
      return { kind: "ident", name: token.name };
    }
    if (token.text === "(") {
      // eslint-disable-next-line no-use-before-define -- mutual recursion
      const inner = parseTernary();
      expect(")");
      return inner;
    }
    if (token.text === "!" || token.text === "-") {
      return { kind: "unary", op: token.text, operand: parsePrimary() };
    }
    throw new ExprError(`Unexpected "${token.text}"`, token.index);
  }

  function parseBinary(minPower: number): ExprNode {
    let left = parsePrimary();
    for (;;) {
      const token = peek();
      if (token?.kind !== "punct") {
        break;
      }
      if (!(token.text in BINDING_POWER)) {
        break;
      }
      const power = BINDING_POWER[token.text as BinaryOp];
      if (power < minPower) {
        break;
      }
      take();
      const right = parseBinary(power + 1);
      left = { kind: "binary", op: token.text as BinaryOp, left, right };
    }
    return left;
  }

  function parseTernary(): ExprNode {
    const condition = parseBinary(1);
    const token = peek();
    if (token?.kind === "punct" && token.text === "?") {
      take();
      const then = parseTernary();
      expect(":");
      const otherwise = parseTernary();
      return { kind: "cond", condition, whenTrue: then, whenFalse: otherwise };
    }
    return condition;
  }

  const root = parseTernary();
  const trailing = tokens[position];
  if (trailing) {
    throw new ExprError(
      `Unexpected trailing "${source.slice(trailing.index)}"`,
      trailing.index,
    );
  }
  return root;
}

/** Values an expression evaluates against, keyed by full dotted name. */
export type ExprEnv = ReadonlyMap<string, number | boolean>;

function truthy(value: number | boolean): boolean {
  return value !== false && value !== 0;
}

function asNumber(value: number | boolean): number {
  return typeof value === "number" ? value : value ? 1 : 0;
}

const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  pow: Math.pow,
};

function evaluateBinary(
  node: ExprNode & { kind: "binary" },
  env: ExprEnv,
): number | boolean {
  if (node.op === "&&") {
    // eslint-disable-next-line no-use-before-define -- mutual recursion
    return truthy(evaluateExpression(node.left, env))
      ? // eslint-disable-next-line no-use-before-define -- mutual recursion
        evaluateExpression(node.right, env)
      : false;
  }
  if (node.op === "||") {
    // eslint-disable-next-line no-use-before-define -- mutual recursion
    const left = evaluateExpression(node.left, env);
    // eslint-disable-next-line no-use-before-define -- mutual recursion
    return truthy(left) ? left : evaluateExpression(node.right, env);
  }
  // eslint-disable-next-line no-use-before-define -- mutual recursion
  const left = evaluateExpression(node.left, env);
  // eslint-disable-next-line no-use-before-define -- mutual recursion
  const right = evaluateExpression(node.right, env);
  switch (node.op) {
    case "+":
      return asNumber(left) + asNumber(right);
    case "-":
      return asNumber(left) - asNumber(right);
    case "*":
      return asNumber(left) * asNumber(right);
    case "/":
      return asNumber(left) / asNumber(right);
    case "%":
      return asNumber(left) % asNumber(right);
    case "<":
      return asNumber(left) < asNumber(right);
    case "<=":
      return asNumber(left) <= asNumber(right);
    case ">":
      return asNumber(left) > asNumber(right);
    case ">=":
      return asNumber(left) >= asNumber(right);
    case "==":
      return left === right;
    case "!=":
      return left !== right;
  }
}

export function evaluateExpression(
  node: ExprNode,
  env: ExprEnv,
): number | boolean {
  switch (node.kind) {
    case "number":
    case "boolean":
      return node.value;
    case "ident": {
      const value = env.get(node.name);
      if (value === undefined) {
        throw new ExprError(`Unknown name "${node.name}"`, 0);
      }
      return value;
    }
    case "unary": {
      const operand = evaluateExpression(node.operand, env);
      return node.op === "!" ? !truthy(operand) : -asNumber(operand);
    }
    case "binary":
      return evaluateBinary(node, env);
    case "cond":
      return truthy(evaluateExpression(node.condition, env))
        ? evaluateExpression(node.whenTrue, env)
        : evaluateExpression(node.whenFalse, env);
    case "call": {
      const fn = MATH_FUNCTIONS[node.name];
      if (!fn) {
        throw new ExprError(`Unknown function "${node.name}"`, 0);
      }
      return fn(
        ...node.args.map((argument) =>
          asNumber(evaluateExpression(argument, env)),
        ),
      );
    }
  }
}

/**
 * The signed margin (robustness) of a boolean expression: `>= 0` iff it
 * holds, with magnitude measuring distance to the boundary. Comparisons
 * yield signed slack, `&&` takes the `min`, `||` the `max`, `!` negates,
 * and a plain boolean is `±Infinity` (no boundary to measure) — the same
 * rules the Python evaluator applies to constraint HIR.
 */
export function marginOf(node: ExprNode, env: ExprEnv): number {
  switch (node.kind) {
    case "boolean":
      return node.value ? Infinity : -Infinity;
    case "number":
      return truthy(node.value) ? Infinity : -Infinity;
    case "ident":
      return truthy(evaluateExpression(node, env)) ? Infinity : -Infinity;
    case "unary":
      if (node.op === "!") {
        return -marginOf(node.operand, env);
      }
      return truthy(evaluateExpression(node, env)) ? Infinity : -Infinity;
    case "binary":
      switch (node.op) {
        case "&&":
          return Math.min(marginOf(node.left, env), marginOf(node.right, env));
        case "||":
          return Math.max(marginOf(node.left, env), marginOf(node.right, env));
        case "<":
        case "<=":
          return (
            asNumber(evaluateExpression(node.right, env)) -
            asNumber(evaluateExpression(node.left, env))
          );
        case ">":
        case ">=":
          return (
            asNumber(evaluateExpression(node.left, env)) -
            asNumber(evaluateExpression(node.right, env))
          );
        case "==": {
          const left = evaluateExpression(node.left, env);
          const right = evaluateExpression(node.right, env);
          if (typeof left === "boolean" || typeof right === "boolean") {
            return left === right ? Infinity : -Infinity;
          }
          return -Math.abs(left - right);
        }
        case "!=": {
          const left = evaluateExpression(node.left, env);
          const right = evaluateExpression(node.right, env);
          if (typeof left === "boolean" || typeof right === "boolean") {
            return left !== right ? Infinity : -Infinity;
          }
          return Math.abs(left - right);
        }
        default:
          return truthy(evaluateExpression(node, env)) ? Infinity : -Infinity;
      }
    case "cond":
      return truthy(evaluateExpression(node.condition, env))
        ? marginOf(node.whenTrue, env)
        : marginOf(node.whenFalse, env);
    case "call":
      return truthy(evaluateExpression(node, env)) ? Infinity : -Infinity;
  }
}

/** A numeric expression as `constant + Σ coefficient · name`, when it is one. */
export type LinearForm = {
  constant: number;
  coefficients: ReadonlyMap<string, number>;
};

function scaleLinear(form: LinearForm, factor: number): LinearForm {
  return {
    constant: form.constant * factor,
    coefficients: new Map(
      [...form.coefficients].map(([name, value]) => [name, value * factor]),
    ),
  };
}

function addLinear(left: LinearForm, right: LinearForm): LinearForm {
  const coefficients = new Map(left.coefficients);
  for (const [name, value] of right.coefficients) {
    coefficients.set(name, (coefficients.get(name) ?? 0) + value);
  }
  return { constant: left.constant + right.constant, coefficients };
}

/**
 * Extracts the linear form of a numeric expression over the given names, or
 * `null` when the expression is not affine in them (a product of two
 * variables, a call, a variable divisor…). What a parameter constraint's
 * routing decision keys on: affine conjuncts go to bound-folding, ordering
 * transforms, or the polytope walk; anything else falls back to rejection.
 */
export function linearFormOf(
  node: ExprNode,
  variables: ReadonlySet<string>,
): LinearForm | null {
  switch (node.kind) {
    case "number":
      return { constant: node.value, coefficients: new Map() };
    case "boolean":
      return null;
    case "ident":
      if (variables.has(node.name)) {
        return { constant: 0, coefficients: new Map([[node.name, 1]]) };
      }
      return null;
    case "unary": {
      if (node.op !== "-") {
        return null;
      }
      const operand = linearFormOf(node.operand, variables);
      return operand && scaleLinear(operand, -1);
    }
    case "binary": {
      if (node.op === "+" || node.op === "-") {
        const left = linearFormOf(node.left, variables);
        const right = linearFormOf(node.right, variables);
        if (!left || !right) {
          return null;
        }
        return addLinear(left, scaleLinear(right, node.op === "-" ? -1 : 1));
      }
      if (node.op === "*") {
        const left = linearFormOf(node.left, variables);
        const right = linearFormOf(node.right, variables);
        if (!left || !right) {
          return null;
        }
        if (left.coefficients.size === 0) {
          return scaleLinear(right, left.constant);
        }
        if (right.coefficients.size === 0) {
          return scaleLinear(left, right.constant);
        }
        return null;
      }
      if (node.op === "/") {
        const left = linearFormOf(node.left, variables);
        const right = linearFormOf(node.right, variables);
        if (!left || !right || right.coefficients.size > 0) {
          return null;
        }
        return scaleLinear(left, 1 / right.constant);
      }
      return null;
    }
    case "cond":
    case "call":
      return null;
  }
}

/**
 * Splits a boolean expression into its top-level `&&` conjuncts — the unit
 * the sampling router classifies one at a time.
 */
export function conjunctsOf(node: ExprNode): ExprNode[] {
  if (node.kind === "binary" && node.op === "&&") {
    return [...conjunctsOf(node.left), ...conjunctsOf(node.right)];
  }
  return [node];
}

/**
 * A comparison conjunct rewritten to canonical `margin >= 0` form: the
 * margin expression whose sign decides satisfaction. `null` for conjuncts
 * that are not a single comparison (disjunctions, bare booleans).
 */
export function canonicalMarginExpr(node: ExprNode): ExprNode | null {
  if (node.kind !== "binary") {
    return null;
  }
  switch (node.op) {
    case "<":
    case "<=":
      return { kind: "binary", op: "-", left: node.right, right: node.left };
    case ">":
    case ">=":
      return { kind: "binary", op: "-", left: node.left, right: node.right };
    default:
      return null;
  }
}

function printWithPower(node: ExprNode, minPower: number): string {
  switch (node.kind) {
    case "number":
      return String(node.value);
    case "boolean":
      return String(node.value);
    case "ident":
      return node.name;
    case "unary":
      return `${node.op}${printWithPower(node.operand, 7)}`;
    case "binary": {
      const power = BINDING_POWER[node.op];
      const text = `${printWithPower(node.left, power)} ${node.op} ${printWithPower(node.right, power + 1)}`;
      return power < minPower ? `(${text})` : text;
    }
    case "cond": {
      const text = `${printWithPower(node.condition, 1)} ? ${printWithPower(node.whenTrue, 0)} : ${printWithPower(node.whenFalse, 0)}`;
      return minPower > 0 ? `(${text})` : text;
    }
    case "call":
      return `${node.name}(${node.args.map((argument) => printWithPower(argument, 0)).join(", ")})`;
  }
}

/** Prints an AST back to source, minimally parenthesized. */
export function printExpression(node: ExprNode): string {
  return printWithPower(node, 0);
}
