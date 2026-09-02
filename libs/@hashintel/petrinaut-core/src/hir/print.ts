/**
 * Prints HIR expressions back to canonical TypeScript source.
 *
 * The inverse of `lower-typescript.ts` for expression surfaces: given a
 * lowered `HirExpr`, produce minimal, consistently-formatted source text that
 * lowers back to a structurally identical tree (ignoring node ids and spans).
 * Used to re-format an expression cell after it validates — format-on-commit
 * without carrying a formatter dependency.
 *
 * Canonical style:
 * - single spaces around binary operators, none after unary operators;
 * - `===`/`!==` for the HIR equality operators;
 * - parentheses only where the precedence/associativity of the tree requires
 *   them (`a - (b - c)`, `(a + b) * c`, `(-2) ** 2`, `(a ? b : c) ? d : e`);
 * - double-quoted string literals with JSON escaping;
 * - numeric literals reproduce their preserved `raw` source text;
 * - `(param) => body` callbacks, with block bodies (`{ const ... return ...; }`)
 *   only where the HIR carries `let` bindings.
 *
 * A node that cannot be printed as (part of) a single expression — a `let`
 * outside a callback body, or a shape the lowering could never have produced —
 * throws instead of emitting text that would lower to something else.
 */
import { lowerTypeScriptToHir } from "./lower-typescript";

import type {
  HirBinaryOp,
  HirConstantName,
  HirDistributionKind,
  HirExpr,
} from "./hir";

/** Operator precedence levels, following the ECMAScript grammar. Higher binds
 * tighter; only the relative order matters. */
const PRECEDENCE_COND = 2;
const PRECEDENCE_OR = 3;
const PRECEDENCE_AND = 4;
const PRECEDENCE_EQUALITY = 8;
const PRECEDENCE_RELATIONAL = 9;
const PRECEDENCE_ADDITIVE = 11;
const PRECEDENCE_MULTIPLICATIVE = 12;
const PRECEDENCE_EXPONENT = 13;
const PRECEDENCE_UNARY = 14;
const PRECEDENCE_POSTFIX = 17;
const PRECEDENCE_PRIMARY = 18;

const BINARY_PRECEDENCE: Record<HirBinaryOp, number> = {
  "||": PRECEDENCE_OR,
  "&&": PRECEDENCE_AND,
  "==": PRECEDENCE_EQUALITY,
  "!=": PRECEDENCE_EQUALITY,
  "<": PRECEDENCE_RELATIONAL,
  "<=": PRECEDENCE_RELATIONAL,
  ">": PRECEDENCE_RELATIONAL,
  ">=": PRECEDENCE_RELATIONAL,
  "+": PRECEDENCE_ADDITIVE,
  "-": PRECEDENCE_ADDITIVE,
  "*": PRECEDENCE_MULTIPLICATIVE,
  "/": PRECEDENCE_MULTIPLICATIVE,
  "%": PRECEDENCE_MULTIPLICATIVE,
  "**": PRECEDENCE_EXPONENT,
};

/** HIR equality is semantic equality; the canonical TypeScript spelling is
 * the strict form (lowering maps both spellings to the same node). */
const BINARY_OP_TEXT: Record<HirBinaryOp, string> = {
  "||": "||",
  "&&": "&&",
  "==": "===",
  "!=": "!==",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "%": "%",
  "**": "**",
};

const CONSTANT_TEXT: Record<HirConstantName, string> = {
  PI: "Math.PI",
  E: "Math.E",
  Infinity: "Infinity",
  NaN: "NaN",
};

const DISTRIBUTION_FACTORY_NAMES: Record<HirDistributionKind, string> = {
  gaussian: "Gaussian",
  uniform: "Uniform",
  lognormal: "Lognormal",
};

/** ASCII identifier names — the subset the printer emits without quoting or
 * bracketing. Conservative: a non-matching record key is quoted (still
 * lowers identically) and a non-matching parameter name is unprintable. */
const IDENTIFIER_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Preserved numeric `raw` text: optional sign(s) and whitespace, then digits
 * in any ECMAScript numeric notation. Rejects hand-built `raw` values that
 * would splice arbitrary code into the output. */
const NUMBER_RAW = /^[+\-\s]*[0-9.][0-9a-fA-F_.xXoObBeE+-]*$/;

/** Locals currently bound to distribution values, mirroring the lowering's
 * `.map(...)` disambiguation between arrays and distributions. */
type DistributionEnv = ReadonlySet<string>;

function unprintable(expr: HirExpr, reason: string): never {
  throw new Error(`Cannot print HIR \`${expr.kind}\` node: ${reason}`);
}

function isIdentifierName(name: string): boolean {
  return IDENTIFIER_NAME.test(name);
}

function bindLocal(
  env: DistributionEnv,
  name: string,
  distributionValued: boolean,
): Set<string> {
  const next = new Set(env);
  if (distributionValued) {
    next.add(name);
  } else {
    next.delete(name);
  }
  return next;
}

function shadowParams(env: DistributionEnv, names: string[]): Set<string> {
  const next = new Set(env);
  for (const name of names) {
    next.delete(name);
  }
  return next;
}

/** Whether re-lowering would treat `expr` as distribution-valued — mirrors
 * `Lowering.isDistributionValued` with the local environment made explicit. */
function isDistributionValued(expr: HirExpr, env: DistributionEnv): boolean {
  switch (expr.kind) {
    case "distribution":
    case "distributionMap":
      return true;
    case "localRef":
      return env.has(expr.name);
    case "cond":
      return (
        isDistributionValued(expr.thenBranch, env) ||
        isDistributionValued(expr.elseBranch, env)
      );
    case "let": {
      let scope = new Set(env);
      for (const binding of expr.bindings) {
        scope = bindLocal(
          scope,
          binding.name,
          isDistributionValued(binding.value, scope),
        );
      }
      return isDistributionValued(expr.body, scope);
    }
    default:
      return false;
  }
}

/** The precedence `expr` will have once printed. A numeric literal whose
 * preserved `raw` carries a sign prints as a unary expression. */
function precedenceOf(expr: HirExpr): number {
  switch (expr.kind) {
    case "numberLit":
      return expr.raw.startsWith("-") || expr.raw.startsWith("+")
        ? PRECEDENCE_UNARY
        : PRECEDENCE_PRIMARY;
    case "boolLit":
    case "stringLit":
    case "localRef":
    case "recordLit":
    case "arrayLit":
      return PRECEDENCE_PRIMARY;
    case "constant":
      // `Math.PI` / `Math.E` print as member accesses; `Infinity` / `NaN`
      // as bare identifiers.
      return expr.name === "PI" || expr.name === "E"
        ? PRECEDENCE_POSTFIX
        : PRECEDENCE_PRIMARY;
    case "paramRef":
    case "scenarioRef":
    case "rangeCall":
    case "fieldAccess":
    case "indexAccess":
    case "length":
    case "stringCall":
    case "mathCall":
    case "uuidGenerate":
    case "uuidFrom":
    case "distribution":
    case "distributionMap":
    case "arrayMap":
    case "arrayReduce":
    case "arrayConcat":
      return PRECEDENCE_POSTFIX;
    case "unary":
      return PRECEDENCE_UNARY;
    case "binary":
      return BINARY_PRECEDENCE[expr.op];
    case "cond":
    case "let":
      return PRECEDENCE_COND;
  }
}

/** Whether a callback body must print as a block: `let` bindings only exist
 * in statement form, directly or behind guard-style conditionals. */
function hasRootLet(expr: HirExpr): boolean {
  if (expr.kind === "let") {
    return true;
  }
  if (expr.kind === "cond") {
    return hasRootLet(expr.thenBranch) || hasRootLet(expr.elseBranch);
  }
  return false;
}

function printRecordKey(key: string): string {
  // `__proto__` is quoted so the text stays inert if it ever reaches a
  // JavaScript evaluator; both spellings lower to the same entry.
  return isIdentifierName(key) && key !== "__proto__"
    ? key
    : JSON.stringify(key);
}

/** Stateless recursive printer — a class only so the mutually recursive
 * printing methods can reference each other (mirroring `Lowering`). */
class Printer {
  printExpr(expr: HirExpr, env: DistributionEnv): string {
    switch (expr.kind) {
      case "numberLit":
        if (!NUMBER_RAW.test(expr.raw)) {
          unprintable(
            expr,
            `raw text ${JSON.stringify(expr.raw)} is not a numeric literal.`,
          );
        }
        return expr.raw;
      case "boolLit":
        return expr.value ? "true" : "false";
      case "stringLit":
        return JSON.stringify(expr.value);
      case "constant":
        return CONSTANT_TEXT[expr.name];
      case "localRef":
        if (!isIdentifierName(expr.name)) {
          unprintable(expr, `\`${expr.name}\` is not a valid identifier.`);
        }
        if (expr.name === "Infinity" || expr.name === "NaN") {
          unprintable(expr, `\`${expr.name}\` would lower to a constant.`);
        }
        return expr.name;
      case "paramRef":
        if (!isIdentifierName(expr.name)) {
          unprintable(
            expr,
            `parameter name \`${expr.name}\` is not an identifier, and bracket access on \`parameters\` does not lower.`,
          );
        }
        return `parameters.${expr.name}`;
      case "scenarioRef":
        if (!isIdentifierName(expr.name)) {
          unprintable(
            expr,
            `scenario parameter name \`${expr.name}\` is not an identifier, and bracket access on \`scenario\` does not lower.`,
          );
        }
        return `scenario.${expr.name}`;
      case "rangeCall":
        return `range(${this.printArgs(expr.args, env)})`;
      case "fieldAccess": {
        const target = this.printMemberTarget(expr.target, env);
        // `.length` would lower to a `length` node, so that field (and any
        // non-identifier field) uses bracket access, which lowers to
        // `fieldAccess` either way.
        return expr.field !== "length" && isIdentifierName(expr.field)
          ? `${target}.${expr.field}`
          : `${target}[${JSON.stringify(expr.field)}]`;
      }
      case "indexAccess":
        if (expr.index.kind === "stringLit") {
          unprintable(
            expr,
            "a string-literal index lowers to `fieldAccess`, not `indexAccess`.",
          );
        }
        return `${this.printMemberTarget(expr.target, env)}[${this.printExpr(
          expr.index,
          env,
        )}]`;
      case "length":
        return `${this.printMemberTarget(expr.target, env)}.length`;
      case "unary":
        return this.printUnary(expr, env);
      case "binary":
        return this.printBinary(expr, env);
      case "cond": {
        const conditionText = this.printExpr(expr.condition, env);
        const condition =
          precedenceOf(expr.condition) < PRECEDENCE_OR
            ? `(${conditionText})`
            : conditionText;
        return `${condition} ? ${this.printExpr(expr.thenBranch, env)} : ${this.printExpr(
          expr.elseBranch,
          env,
        )}`;
      }
      case "let":
        return unprintable(
          expr,
          "`const` bindings only exist inside callback block bodies — a `let` in expression position has no single-expression form.",
        );
      case "mathCall":
        return `Math.${expr.fn}(${this.printArgs(expr.args, env)})`;
      case "recordLit": {
        if (expr.entries.length === 0) {
          return "{}";
        }
        const entries = expr.entries.map(
          (entry) =>
            `${printRecordKey(entry.key)}: ${this.printExpr(entry.value, env)}`,
        );
        return `{ ${entries.join(", ")} }`;
      }
      case "arrayLit":
        return `[${this.printArgs(expr.elements, env)}]`;
      case "arrayMap": {
        if (isDistributionValued(expr.target, env)) {
          unprintable(
            expr,
            "`.map(...)` on a distribution-valued target would lower to `distributionMap`.",
          );
        }
        const params = expr.indexParam
          ? [expr.param.name, expr.indexParam.name]
          : [expr.param.name];
        return `${this.printMemberTarget(expr.target, env)}.map(${this.printCallback(
          params,
          expr.body,
          env,
        )})`;
      }
      case "arrayReduce": {
        const params = expr.indexParam
          ? [expr.accParam.name, expr.param.name, expr.indexParam.name]
          : [expr.accParam.name, expr.param.name];
        return `${this.printMemberTarget(expr.target, env)}.reduce(${this.printCallback(
          params,
          expr.body,
          env,
        )}, ${this.printExpr(expr.initial, env)})`;
      }
      case "arrayConcat":
        return `${this.printMemberTarget(expr.left, env)}.concat(${this.printExpr(
          expr.right,
          env,
        )})`;
      case "stringCall":
        return `${this.printMemberTarget(expr.target, env)}.${expr.fn}(${this.printExpr(
          expr.argument,
          env,
        )})`;
      case "uuidGenerate":
        return "Uuid.generate()";
      case "uuidFrom":
        return `Uuid.from(${this.printExpr(expr.operand, env)})`;
      case "distribution":
        return `Distribution.${DISTRIBUTION_FACTORY_NAMES[expr.dist]}(${this.printArgs(
          expr.args,
          env,
        )})`;
      case "distributionMap":
        if (!isDistributionValued(expr.base, env)) {
          unprintable(
            expr,
            "`.map(...)` on a non-distribution base would lower to `arrayMap`.",
          );
        }
        return `${this.printMemberTarget(expr.base, env)}.map(${this.printCallback(
          [expr.param.name],
          expr.body,
          env,
        )})`;
    }
  }

  /** Prints the target of a member access or method call. The grammar
   * requires a MemberExpression, so anything weaker is parenthesized —
   * including plain numeric literals, where `1.x` would swallow the dot. */
  private printMemberTarget(expr: HirExpr, env: DistributionEnv): string {
    const text = this.printExpr(expr, env);
    return expr.kind === "numberLit" || precedenceOf(expr) < PRECEDENCE_POSTFIX
      ? `(${text})`
      : text;
  }

  private printArgs(args: HirExpr[], env: DistributionEnv): string {
    return args.map((arg) => this.printExpr(arg, env)).join(", ");
  }

  private printUnary(
    expr: Extract<HirExpr, { kind: "unary" }>,
    env: DistributionEnv,
  ): string {
    const operandText = this.printExpr(expr.operand, env);
    const needsParens =
      precedenceOf(expr.operand) < PRECEDENCE_UNARY ||
      // `--a` / `++a` would parse as decrement/increment.
      ((expr.op === "-" || expr.op === "+") && operandText.startsWith(expr.op));
    return expr.op + (needsParens ? `(${operandText})` : operandText);
  }

  private printBinary(
    expr: Extract<HirExpr, { kind: "binary" }>,
    env: DistributionEnv,
  ): string {
    const precedence = BINARY_PRECEDENCE[expr.op];
    // `**` is right-associative, and its left operand must additionally be an
    // update/member/call expression (`-2 ** 2` is a SyntaxError). Everything
    // else is left-associative, so an equal-precedence right child needs
    // parentheses to preserve the tree (`a - (b - c)`).
    const leftNeedsParens =
      expr.op === "**"
        ? precedenceOf(expr.left) < PRECEDENCE_POSTFIX
        : precedenceOf(expr.left) < precedence;
    const rightNeedsParens =
      expr.op === "**"
        ? precedenceOf(expr.right) < precedence
        : precedenceOf(expr.right) <= precedence;
    const left = this.printExpr(expr.left, env);
    const right = this.printExpr(expr.right, env);
    return `${leftNeedsParens ? `(${left})` : left} ${BINARY_OP_TEXT[expr.op]} ${
      rightNeedsParens ? `(${right})` : right
    }`;
  }

  /** Prints an inline `(params) => body` callback, using a block body exactly
   * when the HIR carries `let` bindings. */
  private printCallback(
    paramNames: string[],
    body: HirExpr,
    outerEnv: DistributionEnv,
  ): string {
    for (const name of paramNames) {
      if (!isIdentifierName(name)) {
        unprintable(
          body,
          `callback parameter \`${name}\` is not an identifier.`,
        );
      }
    }
    const env = shadowParams(outerEnv, paramNames);
    const header = `(${paramNames.join(", ")}) =>`;
    if (hasRootLet(body)) {
      return `${header} { ${this.printStatements(body, env).join(" ")} }`;
    }
    const bodyText = this.printExpr(body, env);
    // An object-literal body would parse as a block.
    return body.kind === "recordLit"
      ? `${header} (${bodyText})`
      : `${header} ${bodyText}`;
  }

  /**
   * Prints a callback body as the statement list of a block: `const`
   * bindings, guard `if`s for conditionals whose branches carry bindings,
   * and a final `return` — the exact statement shapes `lowerStatements`
   * folds back into this tree.
   */
  private printStatements(body: HirExpr, env: DistributionEnv): string[] {
    const statements: string[] = [];
    let scope = new Set(env);
    let current = body;
    for (;;) {
      if (current.kind === "let") {
        for (const binding of current.bindings) {
          if (!isIdentifierName(binding.name)) {
            unprintable(
              current,
              `binding name \`${binding.name}\` is not a valid identifier.`,
            );
          }
          statements.push(
            `const ${binding.name} = ${this.printExpr(binding.value, scope)};`,
          );
          scope = bindLocal(
            scope,
            binding.name,
            isDistributionValued(binding.value, scope),
          );
        }
        current = current.body;
      } else if (
        current.kind === "cond" &&
        (hasRootLet(current.thenBranch) || hasRootLet(current.elseBranch))
      ) {
        const condition = this.printExpr(current.condition, scope);
        if (hasRootLet(current.thenBranch)) {
          // Both branches terminate: a final `if`/`else`.
          const thenBlock = this.printStatements(
            current.thenBranch,
            scope,
          ).join(" ");
          const elseBlock = this.printStatements(
            current.elseBranch,
            scope,
          ).join(" ");
          statements.push(
            `if (${condition}) { ${thenBlock} } else { ${elseBlock} }`,
          );
          return statements;
        }
        // Guard clause: the else branch continues as the remaining
        // statements.
        statements.push(
          `if (${condition}) { return ${this.printExpr(current.thenBranch, scope)}; }`,
        );
        current = current.elseBranch;
      } else {
        statements.push(`return ${this.printExpr(current, scope)};`);
        return statements;
      }
    }
  }
}

/**
 * Prints a lowered HIR expression as canonical TypeScript source.
 *
 * The output is a single expression suitable for the `scenario-expression`
 * surface: lowering it with `lowerTypeScriptToHir(printed,
 * "scenario-expression")` yields a tree structurally identical to the input
 * (ignoring node ids and spans), and printing is idempotent. Numeric
 * literals reproduce their preserved `raw` source text exactly.
 *
 * Throws when the expression has no faithful single-expression form: a
 * `let` node outside a callback block body, an `indexAccess` with a
 * string-literal index, a `.map(...)` whose array/distribution reading would
 * flip on re-lowering, or names that are not printable identifiers.
 */
export function hirExpressionToTypeScript(expression: HirExpr): string {
  return new Printer().printExpr(expression, new Set());
}

/**
 * Formats a cell expression by lowering and printing it: canonical spacing,
 * minimal parentheses, preserved numeric literals. Returns null when the
 * code does not lower, or when the tree has no faithful single-expression
 * form — callers keep the user's text untouched in that case.
 */
export function formatTypeScriptExpression(code: string): string | null {
  const lowered = lowerTypeScriptToHir(code, "scenario-expression");
  if (!lowered.ok) {
    return null;
  }
  try {
    return hirExpressionToTypeScript(lowered.fn.body);
  } catch {
    return null;
  }
}
