import { Record } from "effect";
import { pipe } from "effect/Function";

import { isReadonlyArray } from "../internal/array.js";
import * as Type from "./Type/index.js";

import type * as Defs from "./schema.js";

/** The `_` placeholder, which asks the HashQL compiler to infer a type in a {@link fn} signature. */
const inferred = "_" as const;

export { inferred as infer };

/** An explicit type or {@link inferred | infer}, accepted by {@link fn} for parameter and return types. */
export type TypeArgument = Type.Type | typeof inferred;

/** Renders a type argument, preserving the inference placeholder. */
const compileType = (type: TypeArgument): Defs.ExpressionType => {
  if (type === inferred) {
    return inferred;
  }

  return Type.toExpression(type);
};

/** A closure's signature and body, accepted by {@link fn}. */
export interface FnOptions {
  /**
   * Type parameter names, or a record mapping each name to its bound.
   *
   * An array becomes a `#tuple` of unbounded names. In a record, use {@link inferred | infer} for an unbounded parameter. Defaults to no generic parameters.
   */
  readonly generics?:
    | readonly string[]
    | Record.ReadonlyRecord<string, TypeArgument>;
  /** Parameter names and types, in argument order. Names must be identifiers. Use {@link inferred | infer} for an inferred type. */
  readonly params: Record.ReadonlyRecord<string, TypeArgument>;
  /** The return type. Defaults to {@link inferred | infer}. */
  readonly returns?: TypeArgument;
  /** The expression that computes the closure's result. */
  readonly body: Defs.ExpressionType;
}

/** Renders named types as a struct of type expressions. */
const compileTypes = (
  types: Record.ReadonlyRecord<string, TypeArgument>,
): Defs.StructType => ({ "#struct": pipe(types, Record.map(compileType)) });

/** Renders unbounded names as a tuple and named bounds as a struct. */
const compileGenerics = (
  generics: FnOptions["generics"],
): Defs.TupleType | Defs.StructType => {
  if (generics === undefined) {
    return { "#tuple": [] };
  }

  if (isReadonlyArray(generics)) {
    return { "#tuple": generics };
  }

  return compileTypes(generics);
};

/**
 * Defines a closure with named parameters.
 *
 * The result is the call `["fn", generics, params, returns, body]`. Parameter names are in scope in the body, and their record order determines the argument order. The return type defaults to {@link inferred | infer}. Types are written as constructor syntax, as in `JExpr.as`. The builder checks neither the body nor its use of the parameters. Call the closure with `JExpr.call` or bind it with `JExpr.let`.
 *
 * @example <caption>Define a predicate with an inferred parameter type.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 *
 * const isDraft = JExpr.fn({
 *   params: { entity: JExpr.infer },
 *   body: JExpr.call("==", "entity.draft_id", JExpr.literal(null)),
 * });
 * assert.equal(
 *   JExpr.compile(isDraft),
 *   '["fn",{"#tuple":[]},{"#struct":{"entity":"_"}},"_",["==","entity.draft_id",{"#literal":null}]]',
 * );
 * ```
 */
export const fn = (options: FnOptions): Defs.CallType => [
  "fn",
  compileGenerics(options.generics),
  compileTypes(options.params),
  compileType(options.returns ?? inferred),
  options.body,
];
