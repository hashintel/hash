import { walkHir } from "../../../hir/hir";

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
 * What a place's differential equation couples, read off its lowered code.
 *
 * - `coupled`: a token's derivative may depend on other tokens, their count
 *   or its position, so the place integrates as one system.
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

const COUPLED: DynamicsClass = { kind: "coupled" };
const INDEPENDENT: DynamicsClass = { kind: "independent" };

const refersTo = (expr: HirExpr, names: ReadonlySet<string>): boolean => {
  let found = false;
  walkHir(expr, (node) => {
    if (node.kind === "localRef" && names.has(node.name)) {
      found = true;
    }
  });
  return found;
};

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
  /** The map callback's element parameter; absent outside the callback. */
  element: string | null;
  realFields: ReadonlySet<string>;
  /** Forms of the `let` bindings in scope; a null form is a binding the analysis gave up on. */
  locals: ReadonlyMap<string, AffineForm | null>;
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
      if (
        expr.target.kind === "localRef" &&
        expr.target.name === scope.element &&
        scope.realFields.has(expr.field)
      ) {
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
      const locals = new Map(scope.locals);
      for (const binding of expr.bindings) {
        locals.set(binding.name, affineOf(binding.value, { ...scope, locals }));
      }
      return affineOf(expr.body, { ...scope, locals });
    }
    default:
      return null;
  }
};

/**
 * Classifies a place's differential equation from its lowered code.
 *
 * The code is independent when its body maps over the tokens parameter and
 * the callback reads neither that parameter nor its index parameter; any
 * other shape, including a missing HIR, is coupled. An independent callback
 * that builds a record covering every real attribute from affine
 * expressions in the element's real attributes is affine; an attribute the
 * record leaves out has derivative zero, as the compiled equation gives it.
 */
export function classifyDynamics(
  fn: HirFunction | undefined,
  realFields: readonly string[],
): DynamicsClass {
  const tokensParam = fn?.params[0];
  if (!fn || !tokensParam) {
    return COUPLED;
  }
  const outer = peelLets(fn.body);
  const tokensName = new Set([tokensParam.name]);
  if (outer.bindings.some((binding) => refersTo(binding.value, tokensName))) {
    return COUPLED;
  }
  const map = outer.body;
  if (
    map.kind !== "arrayMap" ||
    map.target.kind !== "localRef" ||
    map.target.name !== tokensParam.name
  ) {
    return COUPLED;
  }
  const forbidden = new Set([tokensParam.name]);
  if (map.indexParam) {
    forbidden.add(map.indexParam.name);
  }
  if (refersTo(map.body, forbidden)) {
    return COUPLED;
  }

  const realFieldSet = new Set(realFields);
  const locals = new Map<string, AffineForm | null>();
  const outerScope: Scope = { element: null, realFields: realFieldSet, locals };
  for (const binding of outer.bindings) {
    locals.set(binding.name, affineOf(binding.value, outerScope));
  }
  const inner = peelLets(map.body);
  const innerScope: Scope = {
    element: map.param.name,
    realFields: realFieldSet,
    locals,
  };
  for (const binding of inner.bindings) {
    locals.set(binding.name, affineOf(binding.value, innerScope));
  }
  if (inner.body.kind !== "recordLit") {
    return INDEPENDENT;
  }
  const rows = new Map<string, AffineForm>();
  for (const entry of inner.body.entries) {
    if (!realFieldSet.has(entry.key) || rows.has(entry.key)) {
      return INDEPENDENT;
    }
    const form = affineOf(entry.value, innerScope);
    if (!form) {
      return INDEPENDENT;
    }
    rows.set(entry.key, form);
  }
  // The compiled equation leaves a real attribute the record omits at
  // derivative zero.
  for (const field of realFields) {
    if (!rows.has(field)) {
      rows.set(
        field,
        constantForm(() => 0),
      );
    }
  }
  return { kind: "affine", rows };
}
