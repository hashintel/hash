import {
  binary,
  bool,
  ite,
  max,
  min,
  not,
  num,
  type ReactiveExpr,
  relu,
  scale,
} from "../reactive-module-graph";

import type {
  HirDistributionKind,
  HirExpr,
  HirFunction,
  Span,
} from "../../hir/hir";

/**
 * Translates the linear subset of the HIR to reactive module expressions:
 * sums, scaling by a constant, comparisons, Boolean logic, conditionals,
 * `Math.max`, `Math.min` and `Math.abs` through `relu`, string attributes
 * as codes, and distributions through inputs the harness draws. Everything
 * the theories cannot express is refused with a code the caller reports
 * against its item, and the span of the node that stops it.
 */

/** What a token attribute read resolves to. */
export type AttributeValue = {
  expr: ReactiveExpr;
  sort: "number" | "boolean" | "string";
  /** A string attribute's values, whose indices its expression holds. */
  codes?: readonly string[];
};

/** An attribute the theories cannot hold, refused where the code reads it. */
export type AttributeRefusal = { refused: string; message: string };

export type TokenBinding = {
  /**
   * The value of one attribute, its refusal when the theories cannot hold
   * it, or `undefined` when the colour has no such attribute.
   */
  attribute: (name: string) => AttributeValue | AttributeRefusal | undefined;
};

export type LinearHirEnv = {
  /** The function's input object: `input` for guards, rates and kernels, `tokens` for dynamics. */
  inputName: string;
  /** `input.<Place>[index]`, or `undefined` when the place is not bound. */
  token: (place: string, index: number) => TokenBinding | undefined;
  /** `input.<Place>.length`, the arc weight. */
  tokenCount: (place: string) => number | undefined;
  /** Names bound to a token by the caller, such as a dynamics callback's parameter. */
  tokenLocals?: ReadonlyMap<string, TokenBinding>;
  /**
   * A distribution as a value: an input the harness draws each step, or
   * `undefined` when the draw cannot be an input (a token-dependent spread).
   */
  sample?: (
    kind: HirDistributionKind,
    args: readonly Translated[],
  ) => ReactiveExpr | undefined;
};

export type Translated = AttributeValue;

export class LinearHirRefusal extends Error {
  readonly code: string;
  readonly span: Span;

  constructor(code: string, message: string, span: Span) {
    super(message);
    this.code = code;
    this.span = span;
  }
}

const refuse = (code: string, message: string, node: HirExpr): never => {
  throw new LinearHirRefusal(code, message, node.span);
};

const number = (expr: ReactiveExpr): Translated => ({ expr, sort: "number" });
const boolean = (expr: ReactiveExpr): Translated => ({ expr, sort: "boolean" });

const asNumber = (value: Translated, node: HirExpr): ReactiveExpr =>
  value.sort === "number"
    ? value.expr
    : refuse(
        "sort-mismatch",
        `a ${value.sort} is used where a number is needed`,
        node,
      );

const asBoolean = (value: Translated, node: HirExpr): ReactiveExpr =>
  value.sort === "boolean"
    ? value.expr
    : refuse(
        "sort-mismatch",
        `a ${value.sort} is used where a boolean is needed`,
        node,
      );

const constantOf = (expr: ReactiveExpr): number | undefined =>
  expr.kind === "num" ? expr.value : undefined;

/** `factor * operand`, folding a scale of a scale and of a constant. */
export const scaled = (factor: number, operand: ReactiveExpr): ReactiveExpr => {
  if (operand.kind === "num") {
    return num(factor * operand.value);
  }
  if (operand.kind === "scale") {
    return scale(factor * operand.factor, operand.operand);
  }
  return factor === 1 ? operand : scale(factor, operand);
};

type Scope = {
  env: LinearHirEnv;
  /** `const` names in scope, to their values or the tokens they alias. */
  locals: ReadonlyMap<string, Translated | TokenBinding>;
};

const isToken = (value: Translated | TokenBinding): value is TokenBinding =>
  "attribute" in value;

/** The token an expression denotes, when it denotes one. */
const resolveToken = (
  node: HirExpr,
  scope: Scope,
): TokenBinding | undefined => {
  if (node.kind === "localRef") {
    const local =
      scope.locals.get(node.name) ?? scope.env.tokenLocals?.get(node.name);
    return local !== undefined && isToken(local) ? local : undefined;
  }
  if (
    node.kind === "indexAccess" &&
    node.target.kind === "fieldAccess" &&
    node.target.target.kind === "localRef" &&
    node.target.target.name === scope.env.inputName &&
    node.index.kind === "numberLit"
  ) {
    return scope.env.token(node.target.field, node.index.value);
  }
  return undefined;
};

/** Equality on codes, numbers or Bools, as `==` or `!=`. */
const equality = (
  negate: boolean,
  left: Translated,
  right: Translated,
  node: HirExpr,
): Translated => {
  if (left.sort === "boolean" && right.sort === "boolean") {
    const same = binary(
      "|",
      binary("&", left.expr, right.expr),
      binary("&", not(left.expr), not(right.expr)),
    );
    return boolean(negate ? not(same) : same);
  }
  if (left.sort === "string" && right.sort === "string") {
    const leftCodes = left.codes ?? [];
    const rightCodes = right.codes ?? [];
    if (
      leftCodes.length !== rightCodes.length ||
      leftCodes.some((code, index) => rightCodes[index] !== code)
    ) {
      return refuse(
        "string-codes-differ",
        "the two string attributes take different sets of values, so their codes cannot be compared; compare each with a literal instead",
        node,
      );
    }
  } else if (left.sort !== right.sort) {
    return refuse(
      "sort-mismatch",
      `a ${left.sort} is compared with a ${right.sort}`,
      node,
    );
  }
  return boolean(binary(negate ? "!=" : "==", left.expr, right.expr));
};

const NONLINEAR_MATH = new Set([
  "acos",
  "asin",
  "atan",
  "atan2",
  "cbrt",
  "ceil",
  "cos",
  "cosh",
  "exp",
  "floor",
  "hypot",
  "log",
  "log10",
  "log2",
  "pow",
  "round",
  "sign",
  "sin",
  "sinh",
  "sqrt",
  "tan",
  "tanh",
  "trunc",
]);

const translate = (node: HirExpr, scope: Scope): Translated => {
  switch (node.kind) {
    case "numberLit":
      return number(num(node.value));
    case "boolLit":
      return boolean(bool(node.value));
    case "stringLit":
      return refuse(
        "string-as-value",
        "a string literal can only be compared with a string attribute",
        node,
      );
    case "constant":
      switch (node.name) {
        case "PI":
          return number(num(Math.PI));
        case "E":
          return number(num(Math.E));
        default:
          return refuse(
            "non-finite-constant",
            `${node.name} is not a finite number, so it has no value in the linear theories`,
            node,
          );
      }
    case "localRef": {
      const local =
        scope.locals.get(node.name) ?? scope.env.tokenLocals?.get(node.name);
      if (local === undefined) {
        return refuse(
          "unbound-local",
          `${node.name} is not defined in this code`,
          node,
        );
      }
      if (isToken(local)) {
        return refuse(
          "token-as-value",
          `${node.name} is a whole token; read one of its attributes`,
          node,
        );
      }
      return local;
    }
    case "paramRef":
      return refuse(
        "parameter-unresolved",
        `parameters.${node.name} has no value; the scenario did not inline it`,
        node,
      );
    case "scenarioRef":
    case "rangeCall":
      return refuse(
        "surface-mismatch",
        "scenario-only code cannot run in a module",
        node,
      );
    case "fieldAccess": {
      const token = resolveToken(node.target, scope);
      if (token === undefined) {
        return refuse(
          "unknown-field",
          `${node.field} is read from a value that is not a token`,
          node,
        );
      }
      const value = token.attribute(node.field);
      if (value === undefined) {
        return refuse(
          "unknown-attribute",
          `the token has no attribute named ${node.field}`,
          node,
        );
      }
      return "refused" in value
        ? refuse(value.refused, value.message, node)
        : value;
    }
    case "indexAccess":
      return refuse(
        "token-as-value",
        "a whole token is used as a value; read one of its attributes",
        node,
      );
    case "length": {
      const target = node.target;
      if (
        target.kind === "fieldAccess" &&
        target.target.kind === "localRef" &&
        target.target.name === scope.env.inputName
      ) {
        const count = scope.env.tokenCount(target.field);
        if (count !== undefined) {
          return number(num(count));
        }
      }
      return refuse(
        "unknown-length",
        ".length is only known for an input place",
        node,
      );
    }
    case "unary": {
      const operand = translate(node.operand, scope);
      switch (node.op) {
        case "-":
          return number(scaled(-1, asNumber(operand, node)));
        case "+":
          return number(asNumber(operand, node));
        case "!":
          return boolean(not(asBoolean(operand, node)));
      }
      break;
    }
    case "binary": {
      if (node.op === "==" || node.op === "!=") {
        // A string literal takes the code of the attribute it meets.
        const negate = node.op === "!=";
        const sides = [node.left, node.right] as const;
        const literalIndex = sides.findIndex(
          (side) => side.kind === "stringLit",
        );
        if (literalIndex !== -1) {
          const literal = sides[literalIndex];
          const other = sides[1 - literalIndex];
          if (
            literal === undefined ||
            other === undefined ||
            literal.kind !== "stringLit"
          ) {
            return refuse(
              "unsupported",
              "the comparison is not between two values",
              node,
            );
          }
          const attribute = translate(other, scope);
          if (attribute.sort !== "string") {
            return refuse(
              "sort-mismatch",
              `a string is compared with a ${attribute.sort}`,
              node,
            );
          }
          const code = attribute.codes?.indexOf(literal.value) ?? -1;
          if (code === -1) {
            // A value the attribute never takes: the comparison is decided.
            return boolean(bool(negate));
          }
          return boolean(
            binary(negate ? "!=" : "==", attribute.expr, num(code)),
          );
        }
        return equality(
          negate,
          translate(node.left, scope),
          translate(node.right, scope),
          node,
        );
      }
      const left = translate(node.left, scope);
      const right = translate(node.right, scope);
      switch (node.op) {
        case "+":
        case "-":
          return number(
            binary(node.op, asNumber(left, node), asNumber(right, node)),
          );
        case "*": {
          const leftValue = asNumber(left, node);
          const rightValue = asNumber(right, node);
          const leftConstant = constantOf(leftValue);
          const rightConstant = constantOf(rightValue);
          if (leftConstant !== undefined) {
            return number(scaled(leftConstant, rightValue));
          }
          if (rightConstant !== undefined) {
            return number(scaled(rightConstant, leftValue));
          }
          return refuse(
            "nonlinear-product",
            "two values the tokens decide are multiplied; the linear theories add, subtract, scale by a constant and compare",
            node,
          );
        }
        case "/": {
          const divisor = constantOf(asNumber(right, node));
          if (divisor === undefined || divisor === 0) {
            return refuse(
              "nonlinear-division",
              "a value is divided by one the tokens decide; the linear theories only divide by a non-zero constant",
              node,
            );
          }
          return number(scaled(1 / divisor, asNumber(left, node)));
        }
        case "%":
        case "**":
          return refuse(
            "nonlinear-power",
            `a value is raised to a power (${node.op}); the linear theories add, subtract, scale by a constant and compare`,
            node,
          );
        case "<":
        case "<=":
        case ">":
        case ">=":
          return boolean(
            binary(node.op, asNumber(left, node), asNumber(right, node)),
          );
        case "&&":
          return boolean(
            binary("&", asBoolean(left, node), asBoolean(right, node)),
          );
        case "||":
          return boolean(
            binary("|", asBoolean(left, node), asBoolean(right, node)),
          );
      }
      break;
    }
    case "cond": {
      const condition = asBoolean(translate(node.condition, scope), node);
      const thenBranch = translate(node.thenBranch, scope);
      const elseBranch = translate(node.elseBranch, scope);
      if (thenBranch.sort !== elseBranch.sort) {
        return refuse(
          "sort-mismatch",
          "the two branches of the conditional have different sorts",
          node,
        );
      }
      return {
        expr: ite(condition, thenBranch.expr, elseBranch.expr),
        sort: thenBranch.sort,
        ...(thenBranch.codes === undefined ? {} : { codes: thenBranch.codes }),
      };
    }
    case "let": {
      const locals = new Map(scope.locals);
      for (const binding of node.bindings) {
        const token = resolveToken(binding.value, { ...scope, locals });
        locals.set(
          binding.name,
          token ?? translate(binding.value, { ...scope, locals }),
        );
      }
      return translate(node.body, { ...scope, locals });
    }
    case "mathCall": {
      const args = node.args.map((arg) =>
        asNumber(translate(arg, scope), node),
      );
      switch (node.fn) {
        case "max":
          return number(args.reduce((left, right) => max(left, right)));
        case "min":
          return number(args.reduce((left, right) => min(left, right)));
        case "abs": {
          const [operand] = args;
          return operand === undefined
            ? refuse("nonlinear-math", "Math.abs takes one argument", node)
            : number(binary("+", relu(operand), relu(scaled(-1, operand))));
        }
        case "random":
          return refuse(
            "math-random",
            "Math.random cannot run in a module; use a Distribution, which becomes an input the harness draws",
            node,
          );
        default:
          return NONLINEAR_MATH.has(node.fn)
            ? refuse(
                "nonlinear-math",
                `Math.${node.fn} of a value the tokens decide has no linear form; the linear theories add, subtract, scale by a constant and compare`,
                node,
              )
            : refuse(
                "nonlinear-math",
                `Math.${node.fn} has no linear form`,
                node,
              );
      }
    }
    case "distribution": {
      const args = node.args.map((arg) => translate(arg, scope));
      const drawn = scope.env.sample?.(node.dist, args);
      return drawn === undefined
        ? refuse(
            "distribution-unsupported",
            `a ${node.dist} draw cannot be an input here; the harness draws Uniform and Gaussian with constant spreads`,
            node,
          )
        : number(drawn);
    }
    case "distributionMap": {
      const base = translate(node.base, scope);
      const locals = new Map(scope.locals);
      locals.set(node.param.name, base);
      return translate(node.body, { ...scope, locals });
    }
    case "uuidGenerate":
    case "uuidFrom":
      return refuse(
        "uuid-unsupported",
        "a uuid attribute has no sort in the theories",
        node,
      );
    case "stringCall":
      return refuse(
        "string-call-unsupported",
        "string methods cannot run in a module; a string attribute is a code that is only compared for equality",
        node,
      );
    case "arrayMap":
    case "arrayReduce":
    case "arrayConcat":
    case "arrayLit":
    case "recordLit":
      return refuse(
        "array-in-expression",
        "an array or record is not a value the theories hold; read one element or field",
        node,
      );
  }
  return refuse(
    "unsupported",
    `${node.kind} is not supported in a module`,
    node,
  );
};

/** The function's body as a reactive expression, with its result sort. */
export const translateHirBody = (
  fn: HirFunction,
  env: LinearHirEnv,
): Translated => translate(fn.body, { env, locals: new Map() });

/** A guard: the body must be a Bool. */
export const translateGuard = (
  fn: HirFunction,
  env: LinearHirEnv,
): ReactiveExpr => asBoolean(translateHirBody(fn, env), fn.body);

/** A rate: the body must be a number. */
export const translateRate = (
  fn: HirFunction,
  env: LinearHirEnv,
): ReactiveExpr => asNumber(translateHirBody(fn, env), fn.body);

/** An expression of the body, for a kernel's attribute write or a derivative. */
export const translateValue = (
  node: HirExpr,
  env: LinearHirEnv,
  locals: ReadonlyMap<string, Translated | TokenBinding> = new Map(),
): Translated => translate(node, { env, locals });

/** Resolves a token expression under the caller's locals, for kernels reading `input.P[i]`. */
export const resolveTokenExpr = (
  node: HirExpr,
  env: LinearHirEnv,
  locals: ReadonlyMap<string, Translated | TokenBinding> = new Map(),
): TokenBinding | undefined => resolveToken(node, { env, locals });
