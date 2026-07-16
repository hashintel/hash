/**
 * Type inference and checking over the HIR.
 *
 * Types flow bottom-up from literals and the surface context (token attribute
 * types, parameter types). The checker is deliberately pragmatic: `unknown`
 * propagates silently, and diagnostics are only produced where the checker is
 * confident — TypeScript remains the authoritative type oracle for TS-authored
 * code, so these diagnostics focus on friendlier, domain-specific messages
 * (unknown attribute, derivative on a discrete attribute, Distribution into a
 * discrete attribute, ...) and on runtime compilation paths where no
 * TypeScript checker runs.
 */
import {
  formatHirType,
  HIR_TYPE_BOOL,
  HIR_TYPE_DISTRIBUTION,
  HIR_TYPE_INT,
  HIR_TYPE_REAL,
  HIR_TYPE_STRING,
  HIR_TYPE_UNKNOWN,
  HIR_TYPE_UUID,
} from "./hir";

import type {
  HirDiagnostic,
  HirExpr,
  HirFunction,
  HirMathFn,
  HirNodeId,
  HirType,
  Span,
} from "./hir";
import type { HirSurfaceContext, HirTokenElementInfo } from "./surface-context";

export type HirTypecheckResult = {
  /** Inferred type per HIR node id. */
  types: Map<HirNodeId, HirType>;
  returnType: HirType;
  diagnostics: HirDiagnostic[];
};

const MATH_FN_ARITY: Record<HirMathFn, { min: number; max: number }> = {
  abs: { min: 1, max: 1 },
  acos: { min: 1, max: 1 },
  asin: { min: 1, max: 1 },
  atan: { min: 1, max: 1 },
  atan2: { min: 2, max: 2 },
  cbrt: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  cos: { min: 1, max: 1 },
  cosh: { min: 1, max: 1 },
  exp: { min: 1, max: 1 },
  floor: { min: 1, max: 1 },
  hypot: { min: 1, max: Infinity },
  log: { min: 1, max: 1 },
  log10: { min: 1, max: 1 },
  log2: { min: 1, max: 1 },
  max: { min: 1, max: Infinity },
  min: { min: 1, max: Infinity },
  pow: { min: 2, max: 2 },
  random: { min: 0, max: 0 },
  round: { min: 1, max: 1 },
  sign: { min: 1, max: 1 },
  sin: { min: 1, max: 1 },
  sinh: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  tan: { min: 1, max: 1 },
  tanh: { min: 1, max: 1 },
  trunc: { min: 1, max: 1 },
};

/** Math functions that always produce integers. */
const INT_MATH_FNS = new Set<HirMathFn>([
  "ceil",
  "floor",
  "round",
  "sign",
  "trunc",
]);

function elementType(element: HirTokenElementInfo): HirType {
  switch (element.type) {
    case "real":
      return HIR_TYPE_REAL;
    case "integer":
      return HIR_TYPE_INT;
    case "boolean":
      return HIR_TYPE_BOOL;
    case "uuid":
      return HIR_TYPE_UUID;
    case "string":
      return HIR_TYPE_STRING;
  }
}

function tokenRecordType(elements: HirTokenElementInfo[]): HirType {
  return {
    kind: "record",
    fields: elements.map((element) => ({
      name: element.name,
      type: elementType(element),
    })),
  };
}

function isNumeric(type: HirType): boolean {
  return type.kind === "real" || type.kind === "int" || type.kind === "unknown";
}

function isBoolish(type: HirType): boolean {
  return type.kind === "bool" || type.kind === "unknown";
}

/** Least upper bound, collapsing to `unknown` on structural mismatch. */
function joinTypes(left: HirType, right: HirType): HirType {
  if (left.kind === "unknown" || right.kind === "unknown") {
    return HIR_TYPE_UNKNOWN;
  }
  if (left.kind === right.kind) {
    if (left.kind === "array" && right.kind === "array") {
      return {
        kind: "array",
        element: joinTypes(left.element, right.element),
        length: left.length === right.length ? left.length : undefined,
      };
    }
    if (left.kind === "record" && right.kind === "record") {
      const rightByName = new Map(
        right.fields.map((field) => [field.name, field.type]),
      );
      if (
        left.fields.length !== right.fields.length ||
        !left.fields.every((field) => rightByName.has(field.name))
      ) {
        return HIR_TYPE_UNKNOWN;
      }
      return {
        kind: "record",
        fields: left.fields.map((field) => ({
          name: field.name,
          type: joinTypes(field.type, rightByName.get(field.name)!),
        })),
      };
    }
    return left;
  }
  if (
    (left.kind === "int" && right.kind === "real") ||
    (left.kind === "real" && right.kind === "int")
  ) {
    return HIR_TYPE_REAL;
  }
  return HIR_TYPE_UNKNOWN;
}

class Typechecker {
  readonly types = new Map<HirNodeId, HirType>();
  readonly diagnostics: HirDiagnostic[] = [];

  constructor(private readonly context: HirSurfaceContext) {}

  report(
    span: Span,
    code: string,
    message: string,
    severity: HirDiagnostic["severity"] = "error",
  ): void {
    this.diagnostics.push({ code, message, severity, span });
  }

  check(fn: HirFunction): HirType {
    const env = new Map<string, HirType>();
    const tokensParam = fn.params[0];
    if (tokensParam) {
      env.set(tokensParam.name, this.tokensParamType());
    }
    const returnType = this.infer(fn.body, env);
    this.checkReturnType(fn, returnType);
    return returnType;
  }

  private tokensParamType(): HirType {
    const context = this.context;
    switch (context.surface) {
      case "dynamics":
        return { kind: "array", element: tokenRecordType(context.elements) };
      case "lambda":
      case "kernel":
        return {
          kind: "record",
          fields: context.inputPlaces.map((place) => ({
            name: place.name,
            type: {
              kind: "array",
              element: tokenRecordType(place.elements),
              length: place.tokenCount,
            } satisfies HirType,
          })),
        };
      case "metric":
        return {
          kind: "record",
          fields: [
            {
              name: "places",
              type: {
                kind: "record",
                fields: context.places.map((place) => ({
                  name: place.name,
                  type: {
                    kind: "record",
                    fields: [
                      { name: "count", type: HIR_TYPE_INT },
                      {
                        name: "tokens",
                        type: {
                          kind: "array",
                          element: tokenRecordType(place.elements),
                        } satisfies HirType,
                      },
                    ],
                  } satisfies HirType,
                })),
              },
            },
          ],
        };
    }
  }

  private infer(expr: HirExpr, env: Map<string, HirType>): HirType {
    const type = this.inferUncached(expr, env);
    this.types.set(expr.id, type);
    return type;
  }

  private inferUncached(expr: HirExpr, env: Map<string, HirType>): HirType {
    switch (expr.kind) {
      case "numberLit":
        return Number.isInteger(expr.value) ? HIR_TYPE_INT : HIR_TYPE_REAL;
      case "boolLit":
        return HIR_TYPE_BOOL;
      case "stringLit":
        return HIR_TYPE_STRING;
      case "stringCall": {
        const targetType = this.infer(expr.target, env);
        const argumentType = this.infer(expr.argument, env);
        if (targetType.kind !== "string" && targetType.kind !== "unknown") {
          this.report(
            expr.target.span,
            "hir:type-mismatch",
            `\`.${expr.fn}(...)\` is only available on strings, not ${formatHirType(targetType)}.`,
          );
        }
        if (argumentType.kind !== "string" && argumentType.kind !== "unknown") {
          this.report(
            expr.argument.span,
            "hir:type-mismatch",
            `\`.${expr.fn}(...)\` expects a string argument, got ${formatHirType(argumentType)}.`,
          );
        }
        return HIR_TYPE_BOOL;
      }
      case "uuidGenerate":
        this.checkUuidHelperAllowed(expr.span);
        return HIR_TYPE_UUID;
      case "uuidFrom": {
        this.checkUuidHelperAllowed(expr.span);
        this.infer(expr.operand, env);
        return HIR_TYPE_UUID;
      }
      case "constant":
        return HIR_TYPE_REAL;
      case "localRef":
        return env.get(expr.name) ?? HIR_TYPE_UNKNOWN;
      case "paramRef": {
        const parameter = this.context.parameters.find(
          (candidate) => candidate.name === expr.name,
        );
        if (!parameter) {
          this.report(
            expr.span,
            "hir:unknown-parameter",
            `Unknown parameter \`${expr.name}\`.`,
          );
          return HIR_TYPE_UNKNOWN;
        }
        return elementType({ name: parameter.name, type: parameter.type });
      }
      case "fieldAccess": {
        const targetType = this.infer(expr.target, env);
        if (targetType.kind === "record") {
          const field = targetType.fields.find(
            (candidate) => candidate.name === expr.field,
          );
          if (!field) {
            this.report(
              expr.fieldSpan,
              "hir:unknown-field",
              `\`${expr.field}\` does not exist here — expected one of: ${targetType.fields
                .map((candidate) => candidate.name)
                .join(", ")}.`,
            );
            return HIR_TYPE_UNKNOWN;
          }
          return field.type;
        }
        if (targetType.kind !== "unknown") {
          this.report(
            expr.fieldSpan,
            "hir:invalid-field-access",
            `Cannot access field \`${expr.field}\` on a ${formatHirType(targetType)} value.`,
          );
        }
        return HIR_TYPE_UNKNOWN;
      }
      case "indexAccess": {
        const targetType = this.infer(expr.target, env);
        const indexType = this.infer(expr.index, env);
        if (!isNumeric(indexType)) {
          this.report(
            expr.index.span,
            "hir:invalid-index",
            "Array indices must be numbers.",
          );
        }
        if (targetType.kind === "array") {
          if (
            targetType.length !== undefined &&
            expr.index.kind === "numberLit" &&
            expr.index.value >= targetType.length
          ) {
            this.report(
              expr.span,
              "hir:index-out-of-bounds",
              `Index ${expr.index.raw} is out of bounds — only ${targetType.length} token(s) are available here.`,
            );
          }
          return targetType.element;
        }
        if (targetType.kind !== "unknown") {
          this.report(
            expr.span,
            "hir:invalid-index",
            `Cannot index into a ${formatHirType(targetType)} value.`,
          );
        }
        return HIR_TYPE_UNKNOWN;
      }
      case "length": {
        const targetType = this.infer(expr.target, env);
        if (
          targetType.kind !== "array" &&
          targetType.kind !== "string" &&
          targetType.kind !== "unknown"
        ) {
          this.report(
            expr.span,
            "hir:invalid-length",
            `\`.length\` is only available on arrays and strings, not ${formatHirType(targetType)}.`,
          );
        }
        return HIR_TYPE_INT;
      }
      case "unary": {
        const operandType = this.infer(expr.operand, env);
        if (expr.op === "!") {
          if (!isBoolish(operandType)) {
            this.report(
              expr.span,
              "hir:type-mismatch",
              `\`!\` expects a boolean, got ${formatHirType(operandType)}.`,
            );
          }
          return HIR_TYPE_BOOL;
        }
        if (!isNumeric(operandType)) {
          this.report(
            expr.span,
            "hir:type-mismatch",
            `Unary \`${expr.op}\` expects a number, got ${formatHirType(operandType)}.`,
          );
          return HIR_TYPE_UNKNOWN;
        }
        return operandType;
      }
      case "binary": {
        const leftType = this.infer(expr.left, env);
        const rightType = this.infer(expr.right, env);
        switch (expr.op) {
          case "&&":
          case "||":
            if (!isBoolish(leftType) || !isBoolish(rightType)) {
              this.report(
                expr.span,
                "hir:type-mismatch",
                `\`${expr.op}\` expects booleans.`,
              );
            }
            return HIR_TYPE_BOOL;
          case "==":
          case "!=":
            return HIR_TYPE_BOOL;
          case "<":
          case "<=":
          case ">":
          case ">=":
            if (!isNumeric(leftType) || !isNumeric(rightType)) {
              this.report(
                expr.span,
                "hir:type-mismatch",
                `\`${expr.op}\` expects numbers.`,
              );
            }
            return HIR_TYPE_BOOL;
          case "/":
          case "**":
            this.expectNumeric(expr, leftType, rightType);
            return HIR_TYPE_REAL;
          default:
            this.expectNumeric(expr, leftType, rightType);
            return leftType.kind === "int" && rightType.kind === "int"
              ? HIR_TYPE_INT
              : leftType.kind === "unknown" || rightType.kind === "unknown"
                ? HIR_TYPE_UNKNOWN
                : HIR_TYPE_REAL;
        }
      }
      case "cond": {
        const conditionType = this.infer(expr.condition, env);
        if (!isBoolish(conditionType)) {
          this.report(
            expr.condition.span,
            "hir:type-mismatch",
            `Conditions must be booleans, got ${formatHirType(conditionType)}.`,
          );
        }
        return joinTypes(
          this.infer(expr.thenBranch, env),
          this.infer(expr.elseBranch, env),
        );
      }
      case "let": {
        const scoped = new Map(env);
        for (const binding of expr.bindings) {
          scoped.set(binding.name, this.infer(binding.value, scoped));
        }
        return this.infer(expr.body, scoped);
      }
      case "mathCall": {
        const arity = MATH_FN_ARITY[expr.fn];
        if (expr.args.length < arity.min || expr.args.length > arity.max) {
          this.report(
            expr.span,
            "hir:math-arity",
            arity.min === arity.max
              ? `\`Math.${expr.fn}\` expects ${arity.min} argument(s).`
              : `\`Math.${expr.fn}\` expects at least ${arity.min} argument(s).`,
          );
        }
        let allInt = true;
        for (const argument of expr.args) {
          const argumentType = this.infer(argument, env);
          if (!isNumeric(argumentType)) {
            this.report(
              argument.span,
              "hir:type-mismatch",
              `\`Math.${expr.fn}\` expects numbers, got ${formatHirType(argumentType)}.`,
            );
          }
          if (argumentType.kind !== "int") {
            allInt = false;
          }
        }
        if (INT_MATH_FNS.has(expr.fn)) {
          return HIR_TYPE_INT;
        }
        if (
          (expr.fn === "min" || expr.fn === "max" || expr.fn === "abs") &&
          allInt
        ) {
          return HIR_TYPE_INT;
        }
        return HIR_TYPE_REAL;
      }
      case "recordLit": {
        const seen = new Set<string>();
        const fields: { name: string; type: HirType }[] = [];
        for (const entry of expr.entries) {
          if (seen.has(entry.key)) {
            this.report(
              entry.keySpan,
              "hir:duplicate-key",
              `Duplicate key \`${entry.key}\`.`,
            );
          }
          seen.add(entry.key);
          fields.push({ name: entry.key, type: this.infer(entry.value, env) });
        }
        return { kind: "record", fields };
      }
      case "arrayLit": {
        let element: HirType = HIR_TYPE_UNKNOWN;
        for (const [index, item] of expr.elements.entries()) {
          const itemType = this.infer(item, env);
          element = index === 0 ? itemType : joinTypes(element, itemType);
        }
        return { kind: "array", element, length: expr.elements.length };
      }
      case "arrayMap": {
        const targetType = this.infer(expr.target, env);
        let elementType_: HirType = HIR_TYPE_UNKNOWN;
        let length: number | undefined;
        if (targetType.kind === "array") {
          elementType_ = targetType.element;
          length = targetType.length;
        } else if (targetType.kind !== "unknown") {
          this.report(
            expr.target.span,
            "hir:invalid-map",
            `\`.map(...)\` is only available on arrays, not ${formatHirType(targetType)}.`,
          );
        }
        const scoped = new Map(env);
        scoped.set(expr.param.name, elementType_);
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, HIR_TYPE_INT);
        }
        return {
          kind: "array",
          element: this.infer(expr.body, scoped),
          length,
        };
      }
      case "arrayReduce": {
        const targetType = this.infer(expr.target, env);
        let elementType_: HirType = HIR_TYPE_UNKNOWN;
        if (targetType.kind === "array") {
          elementType_ = targetType.element;
        } else if (targetType.kind !== "unknown") {
          this.report(
            expr.target.span,
            "hir:invalid-map",
            `\`.reduce(...)\` is only available on arrays, not ${formatHirType(targetType)}.`,
          );
        }
        const initialType = this.infer(expr.initial, env);
        const scoped = new Map(env);
        // The accumulator is seeded with the initial value's type; the result
        // is the join of the initial and body types (e.g. int seed + real
        // body → real).
        scoped.set(expr.accParam.name, initialType);
        scoped.set(expr.param.name, elementType_);
        if (expr.indexParam) {
          scoped.set(expr.indexParam.name, HIR_TYPE_INT);
        }
        const bodyType = this.infer(expr.body, scoped);
        return joinTypes(initialType, bodyType);
      }
      case "arrayConcat": {
        const leftType = this.infer(expr.left, env);
        const rightType = this.infer(expr.right, env);
        const elementOf = (type: HirType, span: Span): HirType => {
          if (type.kind === "array") {
            return type.element;
          }
          if (type.kind !== "unknown") {
            this.report(
              span,
              "hir:invalid-map",
              `\`.concat(...)\` is only available on arrays, not ${formatHirType(type)}.`,
            );
          }
          return HIR_TYPE_UNKNOWN;
        };
        return {
          kind: "array",
          element: joinTypes(
            elementOf(leftType, expr.left.span),
            elementOf(rightType, expr.right.span),
          ),
          // The combined length is dynamic.
        };
      }
      case "distribution": {
        this.checkDistributionAllowed(expr.span);
        if (expr.args.length !== 2) {
          this.report(
            expr.span,
            "hir:distribution-arity",
            "Distributions take exactly two arguments.",
          );
        }
        for (const argument of expr.args) {
          const argumentType = this.infer(argument, env);
          if (!isNumeric(argumentType)) {
            this.report(
              argument.span,
              "hir:type-mismatch",
              `Distribution arguments must be numbers, got ${formatHirType(argumentType)}.`,
            );
          }
        }
        return HIR_TYPE_DISTRIBUTION;
      }
      case "distributionMap": {
        const baseType = this.infer(expr.base, env);
        if (baseType.kind !== "distribution" && baseType.kind !== "unknown") {
          this.report(
            expr.base.span,
            "hir:invalid-map",
            `Distribution \`.map(...)\` requires a distribution, got ${formatHirType(baseType)}.`,
          );
        }
        const scoped = new Map(env);
        scoped.set(expr.param.name, HIR_TYPE_REAL);
        const bodyType = this.infer(expr.body, scoped);
        if (!isNumeric(bodyType)) {
          this.report(
            expr.body.span,
            "hir:type-mismatch",
            `Distribution \`.map(...)\` must return a number, got ${formatHirType(bodyType)}.`,
          );
        }
        return HIR_TYPE_DISTRIBUTION;
      }
    }
  }

  private expectNumeric(
    expr: Extract<HirExpr, { kind: "binary" }>,
    leftType: HirType,
    rightType: HirType,
  ): void {
    if (!isNumeric(leftType) || !isNumeric(rightType)) {
      this.report(
        expr.span,
        "hir:type-mismatch",
        `\`${expr.op}\` expects numbers.`,
      );
    }
  }

  private checkUuidHelperAllowed(span: Span): void {
    if (this.context.surface !== "kernel") {
      this.report(
        span,
        "hir:uuid-outside-kernel",
        "`Uuid.generate()` / `Uuid.from(...)` are only meaningful in transition kernel outputs.",
      );
    }
  }

  private checkDistributionAllowed(span: Span): void {
    if (this.context.surface !== "kernel") {
      this.report(
        span,
        "hir:distribution-outside-kernel",
        "Distributions can only be produced in transition kernel outputs — they are sampled when the transition fires.",
      );
    } else if (!this.context.stochasticity) {
      this.report(
        span,
        "hir:distribution-disabled",
        "Distributions require the stochasticity extension, which is disabled for this net.",
      );
    }
  }

  /** Surface-specific checks on the function's result type. */
  private checkReturnType(fn: HirFunction, returnType: HirType): void {
    const context = this.context;
    const bodySpan = fn.body.kind === "let" ? fn.body.body.span : fn.body.span;

    switch (context.surface) {
      case "dynamics": {
        if (returnType.kind !== "array") {
          if (returnType.kind !== "unknown") {
            this.report(
              bodySpan,
              "hir:dynamics-return",
              `Dynamics must return an array of derivative records (one per token), got ${formatHirType(returnType)}.`,
            );
          }
          return;
        }
        if (returnType.element.kind !== "record") {
          return;
        }
        const elementByName = new Map(
          context.elements.map((element) => [element.name, element]),
        );
        for (const field of returnType.element.fields) {
          const element = elementByName.get(field.name);
          if (!element) {
            this.report(
              this.derivativeKeySpan(fn.body, field.name) ?? bodySpan,
              "hir:unknown-attribute",
              `\`${field.name}\` is not an attribute of this type.`,
            );
          } else if (element.type !== "real") {
            this.report(
              this.derivativeKeySpan(fn.body, field.name) ?? bodySpan,
              "hir:discrete-derivative",
              `\`${field.name}\` is a discrete (${element.type}) attribute — only real attributes can have derivatives.`,
            );
          } else if (!isNumeric(field.type)) {
            this.report(
              this.derivativeKeySpan(fn.body, field.name) ?? bodySpan,
              "hir:type-mismatch",
              `The derivative of \`${field.name}\` must be a number, got ${formatHirType(field.type)}.`,
            );
          }
        }
        return;
      }
      case "lambda": {
        if (context.lambdaType === "predicate") {
          if (!isBoolish(returnType)) {
            this.report(
              bodySpan,
              "hir:lambda-return",
              `Predicate lambdas must return a boolean, got ${formatHirType(returnType)}.`,
            );
          }
        } else if (!isNumeric(returnType)) {
          this.report(
            bodySpan,
            "hir:lambda-return",
            `Stochastic lambdas must return a number (the firing rate), got ${formatHirType(returnType)}.`,
          );
        }
        return;
      }
      case "kernel": {
        if (returnType.kind !== "record") {
          if (returnType.kind !== "unknown") {
            this.report(
              bodySpan,
              "hir:kernel-return",
              `Transition kernels must return an object mapping output places to token arrays, got ${formatHirType(returnType)}.`,
            );
          }
          return;
        }
        this.checkKernelOutput(fn, returnType);
        return;
      }
      case "metric": {
        if (!isNumeric(returnType)) {
          this.report(
            bodySpan,
            "hir:metric-return",
            `Metrics must return a number, got ${formatHirType(returnType)}.`,
          );
        }
        return;
      }
    }
  }

  private checkKernelOutput(
    fn: HirFunction,
    returnType: Extract<HirType, { kind: "record" }>,
  ): void {
    const context = this.context;
    if (context.surface !== "kernel") {
      return;
    }
    const placeByName = new Map(
      context.outputPlaces.map((place) => [place.name, place]),
    );
    const outputRecord = this.resultRecordLit(fn.body);

    for (const place of context.outputPlaces) {
      if (!returnType.fields.some((field) => field.name === place.name)) {
        this.report(
          outputRecord?.span ?? fn.body.span,
          "hir:missing-output-place",
          `The kernel must return tokens for output place \`${place.name}\`.`,
        );
      }
    }

    for (const field of returnType.fields) {
      const place = placeByName.get(field.name);
      const keySpan =
        outputRecord?.entries.find((entry) => entry.key === field.name)
          ?.keySpan ?? fn.body.span;
      if (!place) {
        this.report(
          keySpan,
          "hir:unknown-output-place",
          `\`${field.name}\` is not an output place of this transition${
            context.outputPlaces.length > 0
              ? ` — expected: ${context.outputPlaces
                  .map((candidate) => candidate.name)
                  .join(", ")}`
              : ""
          }.`,
        );
        continue;
      }
      if (field.type.kind !== "array") {
        continue;
      }
      if (
        field.type.length !== undefined &&
        field.type.length !== place.tokenCount
      ) {
        this.report(
          keySpan,
          "hir:output-token-count",
          `\`${field.name}\` receives ${place.tokenCount} token(s) per firing (arc weight), but ${field.type.length} were returned.`,
        );
      }
      if (field.type.element.kind !== "record") {
        continue;
      }
      const elementByName = new Map(
        place.elements.map((element) => [element.name, element]),
      );
      for (const tokenField of field.type.element.fields) {
        const element = elementByName.get(tokenField.name);
        if (!element) {
          this.report(
            keySpan,
            "hir:unknown-attribute",
            `\`${tokenField.name}\` is not an attribute of tokens in \`${field.name}\`.`,
          );
          continue;
        }
        if (
          tokenField.type.kind === "distribution" &&
          element.type !== "real"
        ) {
          this.report(
            keySpan,
            "hir:distribution-discrete-attribute",
            `\`${tokenField.name}\` is a discrete (${element.type}) attribute — Distributions can only produce real attributes.`,
          );
        }
        // uuid attributes accept uuids or UUID strings (converted
        // deterministically by the engine).
        if (element.type === "uuid") {
          if (
            tokenField.type.kind !== "uuid" &&
            tokenField.type.kind !== "string" &&
            tokenField.type.kind !== "unknown"
          ) {
            this.report(
              keySpan,
              "hir:type-mismatch",
              `\`${tokenField.name}\` is a uuid attribute — provide a uuid (\`Uuid.generate()\`, \`Uuid.from(...)\`, an input token's uuid), a UUID string, or omit it to auto-generate.`,
            );
          }
          continue;
        }
        if (element.type === "string") {
          if (
            tokenField.type.kind !== "string" &&
            tokenField.type.kind !== "unknown"
          ) {
            this.report(
              keySpan,
              "hir:type-mismatch",
              `\`${tokenField.name}\` is a string attribute but received ${formatHirType(tokenField.type)}.`,
            );
          }
          continue;
        }
        if (
          tokenField.type.kind === "string" ||
          tokenField.type.kind === "uuid"
        ) {
          this.report(
            keySpan,
            "hir:type-mismatch",
            `\`${tokenField.name}\` is a ${element.type} attribute but received ${formatHirType(tokenField.type)}.`,
          );
        }
        if (tokenField.type.kind === "bool" && element.type !== "boolean") {
          this.report(
            keySpan,
            "hir:type-mismatch",
            `\`${tokenField.name}\` is a ${element.type} attribute but received a boolean.`,
          );
        }
        if (
          (tokenField.type.kind === "real" || tokenField.type.kind === "int") &&
          element.type === "boolean"
        ) {
          this.report(
            keySpan,
            "hir:type-mismatch",
            `\`${tokenField.name}\` is a boolean attribute but received a number.`,
          );
        }
      }
      for (const element of place.elements) {
        // uuid attributes may be omitted — the engine generates a fresh UUID
        // from the seeded RNG per firing.
        if (element.type === "uuid") {
          continue;
        }
        if (
          !field.type.element.fields.some(
            (tokenField) => tokenField.name === element.name,
          )
        ) {
          this.report(
            keySpan,
            "hir:missing-attribute",
            `Tokens for \`${field.name}\` are missing the \`${element.name}\` attribute.`,
          );
        }
      }
    }
  }

  /** The record literal the function ultimately returns, if syntactically
   * evident (unwrapping `let` bodies). */
  private resultRecordLit(
    expr: HirExpr,
  ): Extract<HirExpr, { kind: "recordLit" }> | null {
    if (expr.kind === "recordLit") {
      return expr;
    }
    if (expr.kind === "let") {
      return this.resultRecordLit(expr.body);
    }
    return null;
  }

  /** Span of the `name:` key inside the derivative record literal returned by
   * a dynamics body, when it is syntactically evident. */
  private derivativeKeySpan(expr: HirExpr, key: string): Span | null {
    if (expr.kind === "let") {
      return this.derivativeKeySpan(expr.body, key);
    }
    if (expr.kind === "arrayMap") {
      return this.derivativeKeySpan(expr.body, key);
    }
    if (expr.kind === "arrayLit") {
      for (const element of expr.elements) {
        const span = this.derivativeKeySpan(element, key);
        if (span) {
          return span;
        }
      }
      return null;
    }
    if (expr.kind === "recordLit") {
      return expr.entries.find((entry) => entry.key === key)?.keySpan ?? null;
    }
    if (expr.kind === "cond") {
      return (
        this.derivativeKeySpan(expr.thenBranch, key) ??
        this.derivativeKeySpan(expr.elseBranch, key)
      );
    }
    return null;
  }
}

/** Runs type inference and surface checks over a lowered function. */
export function typecheckHir(
  fn: HirFunction,
  context: HirSurfaceContext,
): HirTypecheckResult {
  const checker = new Typechecker(context);
  const returnType = checker.check(fn);
  return {
    types: checker.types,
    returnType,
    diagnostics: checker.diagnostics,
  };
}
