import type { HirExpr, HirFunction, HirLet } from "../../../hir/hir";

export type ParameterReader = Readonly<Record<string, number | boolean>>;

/** A value fixed for the run once the parameters are known. */
export type ConstantFn = (parameters: ParameterReader) => number;

/**
 * An expression affine in a token's real attributes: `constant + Σ
 * coefficient(field) × field`, every term a run constant.
 */
export type AffineForm = {
  constant: ConstantFn;
  coefficients: ReadonlyMap<string, ConstantFn>;
};

/**
 * What a place's composed dynamics couple, read off the lowered code of its
 * terms.
 *
 * - `coupled`: a token's derivative may depend on other tokens, so the place
 *   integrates as one system.
 * - `independent`: each token's derivative depends on its own attributes
 *   only, so every token integrates on its own.
 * - `affine`: independent, and each real attribute's derivative is affine in
 *   the token's real attributes with run-constant coefficients, so a token
 *   advances exactly through the system's propagator. `rows` maps each real
 *   attribute to its derivative's form.
 */
export type DynamicsClass =
  | { kind: "coupled" }
  | { kind: "independent" }
  | { kind: "affine"; rows: ReadonlyMap<string, AffineForm> };

/**
 * One equation composed into a place's dynamics: its lowered code, when the
 * artifacts carry it, and how many tokens it couples.
 */
export type DynamicsTerm = { hir: HirFunction | undefined; arity: number };

const COUPLED: DynamicsClass = { kind: "coupled" };
const INDEPENDENT: DynamicsClass = { kind: "independent" };

/** Peels the `let` layers off an expression, oldest binding first. */
const peelLets = (
  expr: HirExpr,
): { bindings: HirLet["bindings"]; body: HirExpr } => {
  const bindings: HirLet["bindings"] = [];
  let body = expr;
  while (body.kind === "let") {
    bindings.push(...body.bindings);
    body = body.body;
  }
  return { bindings, body };
};

type Scope = {
  /** The equation's tokens tuple parameter. */
  tokens: string;
  /** Local names bound to the token: a bare body's `token`, or the module form's token parameter. */
  tokenAliases: Set<string>;
  realFields: ReadonlySet<string>;
  /** Forms of the `let` bindings in scope; a null form is a binding the analysis gave up on. */
  locals: Map<string, AffineForm | null>;
};

/** Whether `expr` reads the term's one token, by its alias or as the tuple's first element. */
const isTokenRead = (expr: HirExpr, scope: Scope): boolean =>
  (expr.kind === "localRef" && scope.tokenAliases.has(expr.name)) ||
  (expr.kind === "indexAccess" &&
    expr.target.kind === "localRef" &&
    expr.target.name === scope.tokens &&
    expr.index.kind === "numberLit" &&
    expr.index.value === 0);

/** A copy of the scope that further bindings extend without touching the original. */
const childScope = (scope: Scope): Scope => ({
  ...scope,
  tokenAliases: new Set(scope.tokenAliases),
  locals: new Map(scope.locals),
});

/** `value`, computed once for each parameters object it is given. */
const oncePerParameters = (value: ConstantFn): ConstantFn => {
  let computedFor: ParameterReader | null = null;
  let computed = 0;
  return (parameters) => {
    if (parameters !== computedFor) {
      computed = value(parameters);
      computedFor = parameters;
    }
    return computed;
  };
};

/**
 * A local's form, each of its terms computed once per run: every read of
 * the local shares that value, so locals built from earlier locals cost one
 * evaluation each instead of one per path through the chain.
 */
const sharedForm = (form: AffineForm): AffineForm => ({
  constant: oncePerParameters(form.constant),
  coefficients: new Map(
    [...form.coefficients].map(([field, coefficient]) => [
      field,
      oncePerParameters(coefficient),
    ]),
  ),
});

/**
 * Records one `let` binding in the scope: an alias of the token when its
 * value reads the token, otherwise the form of its value.
 */
const bindLocal = (
  scope: Scope,
  name: string,
  value: HirExpr,
  form: () => AffineForm | null,
): void => {
  if (isTokenRead(value, scope)) {
    scope.tokenAliases.add(name);
    scope.locals.delete(name);
  } else {
    scope.tokenAliases.delete(name);
    const bound = form();
    scope.locals.set(name, bound && sharedForm(bound));
  }
};

const constantForm = (value: ConstantFn): AffineForm => ({
  constant: value,
  coefficients: new Map(),
});

const isConstant = (form: AffineForm): boolean => form.coefficients.size === 0;

const mapForms = (
  left: AffineForm,
  right: AffineForm,
  combine: (a: ConstantFn, b: ConstantFn) => ConstantFn,
): AffineForm => {
  const coefficients = new Map<string, ConstantFn>();
  const zero: ConstantFn = () => 0;
  for (const field of new Set([
    ...left.coefficients.keys(),
    ...right.coefficients.keys(),
  ])) {
    coefficients.set(
      field,
      combine(
        left.coefficients.get(field) ?? zero,
        right.coefficients.get(field) ?? zero,
      ),
    );
  }
  return {
    constant: combine(left.constant, right.constant),
    coefficients,
  };
};

const scaleForm = (form: AffineForm, factor: ConstantFn): AffineForm => {
  const coefficients = new Map<string, ConstantFn>();
  for (const [field, coefficient] of form.coefficients) {
    coefficients.set(
      field,
      (parameters) => coefficient(parameters) * factor(parameters),
    );
  }
  return {
    constant: (parameters) => form.constant(parameters) * factor(parameters),
    coefficients,
  };
};

const binaryConstant = (
  op: string,
  left: ConstantFn,
  right: ConstantFn,
): ConstantFn | null => {
  switch (op) {
    case "+":
      return (parameters) => left(parameters) + right(parameters);
    case "-":
      return (parameters) => left(parameters) - right(parameters);
    case "*":
      return (parameters) => left(parameters) * right(parameters);
    case "/":
      return (parameters) => left(parameters) / right(parameters);
    case "%":
      return (parameters) => left(parameters) % right(parameters);
    case "**":
      return (parameters) => left(parameters) ** right(parameters);
    default:
      return null;
  }
};

const CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
  Infinity: Number.POSITIVE_INFINITY,
  NaN: Number.NaN,
};

/**
 * The affine form of an expression in the token's real attributes, or null
 * when it is not affine in them, reads something the analysis does not model
 * or depends on a non-real attribute.
 */
const affineOf = (expr: HirExpr, scope: Scope): AffineForm | null => {
  switch (expr.kind) {
    case "numberLit": {
      const { value } = expr;
      return constantForm(() => value);
    }
    case "boolLit": {
      const value = expr.value ? 1 : 0;
      return constantForm(() => value);
    }
    case "constant": {
      const value = CONSTANTS[expr.name] ?? Number.NaN;
      return constantForm(() => value);
    }
    case "paramRef": {
      const { name } = expr;
      return constantForm((parameters) => {
        const value = parameters[name];
        return typeof value === "boolean" ? (value ? 1 : 0) : (value ?? NaN);
      });
    }
    case "localRef":
      return scope.locals.get(expr.name) ?? null;
    case "fieldAccess":
      if (isTokenRead(expr.target, scope) && scope.realFields.has(expr.field)) {
        return {
          constant: () => 0,
          coefficients: new Map([[expr.field, () => 1]]),
        };
      }
      return null;
    case "unary": {
      const operand = affineOf(expr.operand, scope);
      if (!operand) {
        return null;
      }
      if (expr.op === "+") {
        return operand;
      }
      if (expr.op === "-") {
        return scaleForm(operand, () => -1);
      }
      return null;
    }
    case "binary": {
      const left = affineOf(expr.left, scope);
      const right = left && affineOf(expr.right, scope);
      if (!left || !right) {
        return null;
      }
      if (expr.op === "+" || expr.op === "-") {
        return mapForms(left, right, (a, b) => binaryConstant(expr.op, a, b)!);
      }
      if (expr.op === "*") {
        if (isConstant(right)) {
          return scaleForm(left, right.constant);
        }
        if (isConstant(left)) {
          return scaleForm(right, left.constant);
        }
        return null;
      }
      if (expr.op === "/") {
        if (isConstant(right)) {
          const divisor = right.constant;
          return scaleForm(left, (parameters) => 1 / divisor(parameters));
        }
        return null;
      }
      if (isConstant(left) && isConstant(right)) {
        const combined = binaryConstant(expr.op, left.constant, right.constant);
        return combined ? constantForm(combined) : null;
      }
      return null;
    }
    case "mathCall": {
      const args: ConstantFn[] = [];
      for (const arg of expr.args) {
        const form = affineOf(arg, scope);
        if (!form || !isConstant(form)) {
          return null;
        }
        args.push(form.constant);
      }
      const fn = Math[expr.fn] as (...values: number[]) => number;
      return constantForm((parameters) =>
        fn(...args.map((arg) => arg(parameters))),
      );
    }
    case "let": {
      const inner = childScope(scope);
      for (const binding of expr.bindings) {
        bindLocal(inner, binding.name, binding.value, () =>
          affineOf(binding.value, inner),
        );
      }
      return affineOf(expr.body, inner);
    }
    default:
      return null;
  }
};

/** The scope after `bindings`, oldest first. */
const bindLets = (scope: Scope, bindings: HirLet["bindings"]): Scope => {
  const bound = childScope(scope);
  for (const binding of bindings) {
    bindLocal(bound, binding.name, binding.value, () =>
      affineOf(binding.value, bound),
    );
  }
  return bound;
};

/**
 * The affine rows of one one-token term, or null when it is not affine in
 * the token's real attributes: after its `let` bindings the body must be a
 * record keyed by distinct real attributes whose every value is affine.
 */
const affineRows = (
  fn: HirFunction,
  realFields: ReadonlySet<string>,
): Map<string, AffineForm> | null => {
  const tokensParam = fn.params[0];
  if (!tokensParam) {
    return null;
  }
  const outer = peelLets(fn.body);
  const scope = bindLets(
    {
      tokens: tokensParam.name,
      tokenAliases: new Set(),
      realFields,
      locals: new Map(),
    },
    outer.bindings,
  );
  if (outer.body.kind !== "recordLit") {
    return null;
  }
  const rows = new Map<string, AffineForm>();
  for (const entry of outer.body.entries) {
    if (!realFields.has(entry.key) || rows.has(entry.key)) {
      return null;
    }
    const form = affineOf(entry.value, scope);
    if (!form) {
      return null;
    }
    rows.set(entry.key, form);
  }
  return rows;
};

/**
 * Classifies a place's composed dynamics from the lowered code of its terms.
 *
 * The place's tokens are independent when every term couples one token: such
 * an equation reads nothing but that token and the parameters, and the
 * place's derivative is the terms' sum. Independent dynamics are affine when
 * every term's body is a record of expressions affine in the token's real
 * attributes with run-constant coefficients; the rows are the terms' rows
 * added up, and an attribute no record names has derivative zero, as the
 * compiled equations give it. A term over several tokens, a term without
 * HIR, or no term at all couples the place.
 */
export function classifyDynamics(
  terms: readonly DynamicsTerm[],
  realFields: readonly string[],
): DynamicsClass {
  const functions: HirFunction[] = [];
  for (const term of terms) {
    if (!term.hir || term.arity !== 1) {
      return COUPLED;
    }
    functions.push(term.hir);
  }
  if (functions.length === 0) {
    return COUPLED;
  }
  const realFieldSet = new Set(realFields);
  const rows = new Map<string, AffineForm>(
    realFields.map((field) => [field, constantForm(() => 0)]),
  );
  for (const fn of functions) {
    const termRows = affineRows(fn, realFieldSet);
    if (!termRows) {
      return INDEPENDENT;
    }
    for (const [field, form] of termRows) {
      const sum = rows.get(field) ?? constantForm(() => 0);
      rows.set(
        field,
        mapForms(
          sum,
          form,
          (a, b) => (parameters) => a(parameters) + b(parameters),
        ),
      );
    }
  }
  return { kind: "affine", rows };
}
