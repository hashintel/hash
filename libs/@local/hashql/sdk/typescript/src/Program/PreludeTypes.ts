/**
 * Semantic operations used by the representative default declarations.
 *
 * Named identities use their absolute HashQL paths. Generic signatures inspect the semantic argument tuple supplied by the expression or type constructor, without widening it to a common element type. `Prelude` re-exports these types.
 *
 * @module
 */
import type * as Type from "../Type.js";
import type * as ExpressionType from "./ExpressionType.js";

/** The UUID type, an opaque string named by its HashQL path. */
export type Uuid = Type.Opaque<"::core::uuid::Uuid", Type.PrimitiveString>;
/** The entity identifier type, an opaque wrapper around {@link Uuid}. */
export type EntityUuid = Type.Opaque<
  "::graph::types::knowledge::entity::EntityUuid",
  Uuid
>;

/** The operation of the built-in `List`, which maps one element type to a list type. */
export interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : never;
}

/** The operation of the built-in `Dict`, which maps a key type and a value type to a dictionary type. */
export interface Dict extends Type.TypeConstructor {
  readonly arity: 2;
  readonly type: this["Target"] extends readonly [
    infer K extends Type.Any,
    infer V extends Type.Any,
  ]
    ? Type.Dict<K, V>
    : never;
}

/**
 * The signature of the built-in `eq`, which compares two operands and returns Boolean.
 *
 * The operand types need not match. A call with any other number of arguments selects parameters that no argument satisfies.
 */
export interface Comparison extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [
    infer L extends Type.Any,
    infer R extends Type.Any,
  ]
    ? Type.Function<readonly [L, R], Type.PrimitiveBoolean>
    : Type.Function<readonly [Type.Never, Type.Never], Type.PrimitiveBoolean>;
}

/**
 * The signature of the built-in `add`.
 *
 * Each operand must be an Integer or a Number. The result is Integer when both operands are Integer, Number when both are Number, and the union of Integer and Number for one of each. Other operands select parameters that no argument satisfies, with a Never result.
 */
export interface Arithmetic extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [
    infer L extends Type.PrimitiveInteger | Type.PrimitiveNumber,
    infer R extends Type.PrimitiveInteger | Type.PrimitiveNumber,
  ]
    ? Type.Function<readonly [L, R], ExpressionType.Conditional<L, R>>
    : Type.Function<readonly [Type.Never, Type.Never], Type.Never>;
}
