/**
 * Semantic operations used by the representative default declarations.
 *
 * Named identities use their absolute HashQL paths. Generic signatures inspect the semantic argument tuple supplied by the expression or type constructor, without widening it to a common element type.
 *
 * @module
 */
import type * as Type from "../type/index.js";
import type { Conditional } from "./ExpressionType.js";

export type Uuid = Type.Opaque<"::core::uuid::Uuid", Type.PrimitiveString>;
export type EntityUuid = Type.Opaque<
  "::graph::types::knowledge::entity::EntityUuid",
  Uuid
>;

export interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : never;
}

export interface Dict extends Type.TypeConstructor {
  readonly arity: 2;
  readonly type: this["Target"] extends readonly [
    infer K extends Type.Any,
    infer V extends Type.Any,
  ]
    ? Type.Dict<K, V>
    : never;
}

export interface Comparison extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [
    infer L extends Type.Any,
    infer R extends Type.Any,
  ]
    ? Type.Function<readonly [L, R], Type.PrimitiveBoolean>
    : Type.Function<readonly [Type.Never, Type.Never], Type.PrimitiveBoolean>;
}

export interface Arithmetic extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [
    infer L extends Type.PrimitiveInteger | Type.PrimitiveNumber,
    infer R extends Type.PrimitiveInteger | Type.PrimitiveNumber,
  ]
    ? Type.Function<readonly [L, R], Conditional<L, R>>
    : Type.Function<readonly [Type.Never, Type.Never], Type.Never>;
}
