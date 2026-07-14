/**
 * HIR — high-level intermediate representation for Petrinaut user code.
 *
 * The HIR is a source-spanned, JSON-serializable expression tree that sits
 * between the TypeScript authoring surface and the execution backends
 * (JavaScript today, WASM/GPU later). Nodes carry ids and spans, not inferred
 * types; `typecheck.ts` computes a separate `Map<HirNodeId, HirType>`.
 *
 * Design invariants:
 * - Every node carries a stable `id` (unique within one `HirFunction`) and a
 *   `span` into the *user-visible* source text, so analyses can be keyed off
 *   nodes without mutating them and diagnostics always land on the right
 *   range in the editor.
 * - The tree is pure and expression-oriented (OCaml-like): `let` bindings,
 *   conditionals and `map` comprehensions instead of statements and loops.
 *   There is no mutation and no recursion, which makes symbolic evaluation
 *   (distribution DAGs, dependency sets, constant folding) decidable.
 * - Probability distributions are first-class node kinds, not opaque calls,
 *   so the sampling structure of a transition kernel is directly visible.
 */

/** Half-open span into the user-visible source text, in UTF-16 code units. */
export type Span = {
  start: number;
  length: number;
};

/** Node identifier, unique within a single `HirFunction`. */
export type HirNodeId = number;

/**
 * The user-code surfaces the HIR can currently represent.
 *
 * `dynamics` — differential equations (`Dynamics(...)`)
 * `lambda` — transition firing predicates / stochastic rates (`Lambda(...)`)
 * `kernel` — transition kernels (`TransitionKernel(...)`)
 * `metric` — Monte-Carlo/timeline metrics: a bare function *body* over a
 *   `state` object (statements ending in `return <number>`), not an
 *   `export default` module.
 *
 * Scenario expressions are expressible with the same node set but do not
 * have a lowering entry point yet (see `README.md`).
 */
export type HirSurfaceKind = "dynamics" | "lambda" | "kernel" | "metric";

/** Scalar and structural types inferred over HIR nodes. */
export type HirType =
  | { kind: "real" }
  | { kind: "int" }
  | { kind: "bool" }
  | {
      kind: "record";
      fields: { name: string; type: HirType }[];
    }
  | {
      kind: "array";
      element: HirType;
      /** Statically-known length (e.g. arc-weight token tuples). */
      length?: number;
    }
  /** A 128-bit identifier attribute (surfaced to user code as `bigint`). */
  | { kind: "uuid" }
  /** An interned string attribute. */
  | { kind: "string" }
  /** A probability distribution over reals. */
  | { kind: "distribution" }
  | { kind: "unknown" };

export const HIR_TYPE_REAL: HirType = { kind: "real" };
export const HIR_TYPE_INT: HirType = { kind: "int" };
export const HIR_TYPE_BOOL: HirType = { kind: "bool" };
export const HIR_TYPE_UUID: HirType = { kind: "uuid" };
export const HIR_TYPE_STRING: HirType = { kind: "string" };
export const HIR_TYPE_DISTRIBUTION: HirType = { kind: "distribution" };
export const HIR_TYPE_UNKNOWN: HirType = { kind: "unknown" };

export type HirBinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||";

export type HirUnaryOp = "-" | "+" | "!";

/** Math builtins the HIR understands (subset of ECMAScript `Math`). */
export const HIR_MATH_FNS = [
  "abs",
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
  "max",
  "min",
  "pow",
  "random",
  "round",
  "sign",
  "sin",
  "sinh",
  "sqrt",
  "tan",
  "tanh",
  "trunc",
] as const;

export type HirMathFn = (typeof HIR_MATH_FNS)[number];

export type HirConstantName = "PI" | "E" | "Infinity" | "NaN";

export type HirDistributionKind = "gaussian" | "uniform" | "lognormal";

type HirNodeBase = {
  id: HirNodeId;
  span: Span;
};

/** Numeric literal. `raw` preserves the exact source text (e.g. `"1e-9"`). */
export type HirNumberLit = HirNodeBase & {
  kind: "numberLit";
  value: number;
  raw: string;
};

export type HirBoolLit = HirNodeBase & {
  kind: "boolLit";
  value: boolean;
};

/** String literal — valid wherever `string` attributes flow (comparisons,
 * kernel outputs, uuid coercion). */
export type HirStringLit = HirNodeBase & {
  kind: "stringLit";
  value: string;
};

/** `Uuid.generate()` — a fresh UUID drawn from the seeded RNG when the
 * transition fires (kernel outputs only). */
export type HirUuidGenerate = HirNodeBase & {
  kind: "uuidGenerate";
};

/** `Uuid.from(value)` — deterministic conversion of a value to a UUID
 * (kernel outputs only). */
export type HirUuidFrom = HirNodeBase & {
  kind: "uuidFrom";
  operand: HirExpr;
};

export const HIR_STRING_FNS = ["startsWith", "endsWith", "includes"] as const;

export type HirStringFn = (typeof HIR_STRING_FNS)[number];

/** Pure string predicate: `target.startsWith(arg)` etc. */
export type HirStringCall = HirNodeBase & {
  kind: "stringCall";
  fn: HirStringFn;
  target: HirExpr;
  argument: HirExpr;
};

/** Named numeric constant (`Math.PI`, `Infinity`, ...). */
export type HirConstant = HirNodeBase & {
  kind: "constant";
  name: HirConstantName;
};

/** Reference to a local binding: a function parameter, `let`/`const` binding,
 * or `map` callback parameter. */
export type HirLocalRef = HirNodeBase & {
  kind: "localRef";
  name: string;
};

/** Model parameter access — lowered from `parameters.<name>`. */
export type HirParamRef = HirNodeBase & {
  kind: "paramRef";
  name: string;
};

/** Record field access: `target.field` / `target["field"]`. */
export type HirFieldAccess = HirNodeBase & {
  kind: "fieldAccess";
  target: HirExpr;
  field: string;
  /** Span of just the field name, for precise diagnostics. */
  fieldSpan: Span;
};

/** Array element access: `target[index]`. */
export type HirIndexAccess = HirNodeBase & {
  kind: "indexAccess";
  target: HirExpr;
  index: HirExpr;
};

/** Array length access: `target.length`. */
export type HirLength = HirNodeBase & {
  kind: "length";
  target: HirExpr;
};

export type HirUnary = HirNodeBase & {
  kind: "unary";
  op: HirUnaryOp;
  operand: HirExpr;
};

export type HirBinary = HirNodeBase & {
  kind: "binary";
  op: HirBinaryOp;
  left: HirExpr;
  right: HirExpr;
};

/** Conditional expression — lowered from ternaries. */
export type HirCond = HirNodeBase & {
  kind: "cond";
  condition: HirExpr;
  thenBranch: HirExpr;
  elseBranch: HirExpr;
};

export type HirLetBinding = {
  name: string;
  nameSpan: Span;
  value: HirExpr;
};

/** Sequential (non-recursive) bindings scoping a body expression — lowered
 * from `const` statements followed by `return`. */
export type HirLet = HirNodeBase & {
  kind: "let";
  bindings: HirLetBinding[];
  body: HirExpr;
};

export type HirMathCall = HirNodeBase & {
  kind: "mathCall";
  fn: HirMathFn;
  args: HirExpr[];
};

export type HirRecordEntry = {
  key: string;
  keySpan: Span;
  value: HirExpr;
};

export type HirRecordLit = HirNodeBase & {
  kind: "recordLit";
  entries: HirRecordEntry[];
};

export type HirArrayLit = HirNodeBase & {
  kind: "arrayLit";
  elements: HirExpr[];
};

/**
 * Array comprehension — lowered from `collection.map((param, indexParam) =>
 * body)`. Object-destructured callback parameters are desugared during
 * lowering into `fieldAccess(localRef(param), field)` nodes.
 */
export type HirArrayMap = HirNodeBase & {
  kind: "arrayMap";
  target: HirExpr;
  param: { name: string; span: Span };
  indexParam?: { name: string; span: Span };
  body: HirExpr;
};

/**
 * Array fold — lowered from `collection.reduce((acc, element, index?) =>
 * body, initial)`. The callback must be an inline arrow/function expression
 * with 2–3 parameters, and `.reduce` takes exactly two call arguments.
 */
export type HirArrayReduce = HirNodeBase & {
  kind: "arrayReduce";
  target: HirExpr;
  accParam: { name: string; span: Span };
  param: { name: string; span: Span };
  indexParam?: { name: string; span: Span };
  body: HirExpr;
  initial: HirExpr;
};

/** Array concatenation — lowered from `a.concat(b)` (single argument). */
export type HirArrayConcat = HirNodeBase & {
  kind: "arrayConcat";
  left: HirExpr;
  right: HirExpr;
};

/** Distribution construction: `Distribution.Gaussian(mean, deviation)`, ... */
export type HirDistribution = HirNodeBase & {
  kind: "distribution";
  dist: HirDistributionKind;
  args: HirExpr[];
};

/** Derived distribution: `base.map((param) => body)`. */
export type HirDistributionMap = HirNodeBase & {
  kind: "distributionMap";
  base: HirExpr;
  param: { name: string; span: Span };
  body: HirExpr;
};

export type HirExpr =
  | HirNumberLit
  | HirBoolLit
  | HirStringLit
  | HirStringCall
  | HirUuidGenerate
  | HirUuidFrom
  | HirConstant
  | HirLocalRef
  | HirParamRef
  | HirFieldAccess
  | HirIndexAccess
  | HirLength
  | HirUnary
  | HirBinary
  | HirCond
  | HirLet
  | HirMathCall
  | HirRecordLit
  | HirArrayLit
  | HirArrayMap
  | HirArrayReduce
  | HirArrayConcat
  | HirDistribution
  | HirDistributionMap;

/**
 * A lowered user function. `params[0]` is the tokens/input parameter,
 * `params[1]` (when present) is the parameters object — its property
 * accesses are lowered to `paramRef` nodes, so it never appears as a
 * `localRef` in the body.
 */
export type HirFunction = {
  hirVersion: 1;
  surface: HirSurfaceKind;
  params: { name: string; span: Span }[];
  body: HirExpr;
  /** Span of the whole user function expression in the source text. */
  span: Span;
};

export type HirDiagnosticSeverity = "error" | "warning" | "info" | "hint";

/**
 * Diagnostic produced by lowering or by HIR analyses. Spans are always
 * relative to the user-visible source text (not any generated wrapper), so
 * they can be surfaced in the editor without further adjustment.
 */
export type HirDiagnostic = {
  /** Stable string code, e.g. `"hir:unsupported-syntax"`. */
  code: string;
  message: string;
  severity: HirDiagnosticSeverity;
  span: Span;
};

/** Returns the direct children of a node, in source order. */
export function hirChildren(expr: HirExpr): HirExpr[] {
  switch (expr.kind) {
    case "numberLit":
    case "boolLit":
    case "stringLit":
    case "uuidGenerate":
    case "constant":
    case "localRef":
    case "paramRef":
      return [];
    case "uuidFrom":
      return [expr.operand];
    case "stringCall":
      return [expr.target, expr.argument];
    case "fieldAccess":
      return [expr.target];
    case "indexAccess":
      return [expr.target, expr.index];
    case "length":
      return [expr.target];
    case "unary":
      return [expr.operand];
    case "binary":
      return [expr.left, expr.right];
    case "cond":
      return [expr.condition, expr.thenBranch, expr.elseBranch];
    case "let":
      return [...expr.bindings.map((binding) => binding.value), expr.body];
    case "mathCall":
      return expr.args;
    case "recordLit":
      return expr.entries.map((entry) => entry.value);
    case "arrayLit":
      return expr.elements;
    case "arrayMap":
      return [expr.target, expr.body];
    case "arrayReduce":
      // Source order: target, callback body, initial value.
      return [expr.target, expr.body, expr.initial];
    case "arrayConcat":
      return [expr.left, expr.right];
    case "distribution":
      return expr.args;
    case "distributionMap":
      return [expr.base, expr.body];
  }
}

/** Depth-first pre-order walk over an expression tree. */
export function walkHir(expr: HirExpr, visit: (node: HirExpr) => void): void {
  visit(expr);
  for (const child of hirChildren(expr)) {
    walkHir(child, visit);
  }
}

/** Formats a type for use in diagnostics. */
export function formatHirType(type: HirType): string {
  switch (type.kind) {
    case "real":
      return "real";
    case "int":
      return "integer";
    case "bool":
      return "boolean";
    case "uuid":
      return "uuid";
    case "string":
      return "string";
    case "distribution":
      return "Distribution";
    case "record":
      return `{ ${type.fields
        .map((field) => `${field.name}: ${formatHirType(field.type)}`)
        .join("; ")} }`;
    case "array":
      return type.length === undefined
        ? `${formatHirType(type.element)}[]`
        : `[${Array.from({ length: type.length })
            .fill(formatHirType(type.element))
            .join(", ")}]`;
    case "unknown":
      return "unknown";
  }
}
