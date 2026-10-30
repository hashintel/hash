/**
 * Compile-time descriptions of HashQL types.
 *
 * A descriptor is a TypeScript type that stands for a HashQL type, such as `Type.Struct<{ readonly name: Type.PrimitiveString }>`. Type expressions carry descriptors so that TypeScript can preserve the semantic arguments of generic types while the SDK builds syntax. The package exports this module as types alone. No descriptor value exists at runtime. Nothing compares a descriptor with the HashQL declaration it annotates. `TypeExpression.reference<T>()` takes the descriptor on trust. The HashQL compiler checks the emitted program.
 *
 * TypeScript compares descriptors by `_tag`, by field and by position. This comparison is stricter than HashQL's subtyping on purpose. Where a parameter expects a union, TypeScript rejects the same members in another order and rejects a single member. It also rejects {@link PrimitiveInteger} for {@link PrimitiveNumber}, {@link Never} for any other type and any other type for {@link Unknown}. HashQL accepts each of them. The SDK leaves subtyping to the HashQL compiler rather than reproducing its type checker in TypeScript.
 *
 * Type parameters accept descriptors rather than JavaScript value types. TypeScript rejects `Type.List<string>` and accepts `Type.List<Type.PrimitiveString>`. Use {@link Any} to constrain a generic without losing its concrete type arguments. Use {@link All} to inspect a type whose arguments are unknown and narrow it by `_tag`. Each generic type has corresponding `Any` and `All` forms. A descriptor with an erased child, such as `Type.List<Type.Any>`, satisfies `Any` but not `All`.
 *
 * @example <caption>Type-only: describe a record and read its parts.</caption>
 * ```ts
 * import type { Type } from "@local/hashql";
 *
 * type Equal<A, B> =
 *   (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
 *     ? true
 *     : false;
 *
 * type User = Type.Struct<{
 *   readonly id: Type.Opaque<"example::UserId", Type.PrimitiveInteger>;
 *   readonly names: Type.List<Type.PrimitiveString>;
 * }>;
 *
 * export const elementIsString: Equal<
 *   User["fields"]["names"]["element"],
 *   Type.PrimitiveString
 * > = true;
 * export const idIsNominal: Equal<
 *   User["fields"]["id"]["name"],
 *   "example::UserId"
 * > = true;
 * ```
 *
 * @module
 */

import type { HKT } from "effect";
import type { ReadonlyRecord } from "effect/Record";

/** A HashQL type with its parameters erased. */
export interface Any {
  readonly _tag: All["_tag"];
}

/** All supported type forms, with recursively inspectable children. */
export type All =
  | Union.All
  | Intersection.All
  | Opaque.All
  | Struct.All
  | Tuple.All
  | Dict.All
  | List.All
  | Function.All
  | GenericFunction.All
  | Primitive
  | Never
  | Unknown;

/** {@link Any} under a name the type namespaces can use, because inside `declare namespace Union` a bare `Any` names `Union.Any` itself. */
type AnyType = Any;

/** {@link All} under a name the type namespaces can use, because inside `declare namespace Union` a bare `All` names `Union.All` itself. */
type AllTypes = All;

/** A value belonging to at least one of the member types. */
export interface Union<T extends readonly Any[]> {
  readonly _tag: "Union";
  readonly types: T;
}

export declare namespace Union {
  /** A union with erased member parameters. */
  export type Any = Union<readonly AnyType[]>;
  /** A union whose members support discriminant narrowing. */
  export interface All extends Union<readonly AllTypes[]> {}
}

/** A value satisfying every member type. */
export interface Intersection<T extends readonly Any[]> {
  readonly _tag: "Intersection";
  readonly types: T;
}

export declare namespace Intersection {
  /** An intersection with erased member parameters. */
  export type Any = Intersection<readonly AnyType[]>;
  /** An intersection whose members support discriminant narrowing. */
  export interface All extends Intersection<readonly AllTypes[]> {}
}

/**
 * A nominal type distinguished by its name and underlying type.
 *
 * TypeScript accepts an opaque descriptor only where both the name and the underlying type match. A parameter of type `Type.PrimitiveInteger` or `Type.Opaque<"PostId", Type.PrimitiveInteger>` rejects `Type.Opaque<"UserId", Type.PrimitiveInteger>`. The underlying descriptor remains available through `type`.
 *
 * The name exists only in TypeScript. Emitted syntax names the declaration that introduced the type, such as `::core::uuid::Uuid`, rather than this name. Declarations that share a name and an underlying type are therefore interchangeable to TypeScript even when they emit different HashQL types.
 */
export interface Opaque<Name extends string | symbol, T extends Any> {
  readonly _tag: "Opaque";
  /** The identity TypeScript compares, a string literal or a symbol type. */
  readonly name: Name;
  /** The underlying representation. */
  readonly type: T;
}

export declare namespace Opaque {
  /** An opaque type with an erased name and underlying type parameters. */
  export type Any = Opaque<string | symbol, AnyType>;
  /** An opaque type with an inspectable underlying type. */
  export interface All extends Opaque<string | symbol, AllTypes> {}
}

/** Field types with the concrete key set erased. */
interface StructFields<T extends Any> extends ReadonlyRecord<string, T> {}

/** A record with a type for each named field. */
export interface Struct<T extends StructFields<Any>> {
  readonly _tag: "Struct";
  readonly fields: T;
}

export declare namespace Struct {
  /** A struct with erased field names and type parameters. */
  export type Any = Struct<StructFields<AnyType>>;
  /** A struct whose field types support discriminant narrowing. */
  export interface All extends Struct<StructFields<AllTypes>> {}
}

/**
 * A fixed-length sequence with a type for each position.
 *
 * `T` must be a tuple of required elements. Arrays, optional elements and open-ended rest elements fail the constraint. {@link Tuple.Any} and {@link Tuple.All} erase the length for code that handles arbitrary tuple types.
 */
export interface Tuple<
  T extends readonly Any[] & {
    readonly length: number extends T["length"] ? never : number;
  },
> {
  readonly _tag: "Tuple";
  readonly fields: T;
}

export declare namespace Tuple {
  /** A tuple with erased length and element type parameters. */
  export interface Any {
    readonly _tag: "Tuple";
    readonly fields: readonly AnyType[];
  }

  /** A tuple whose element types support discriminant narrowing. */
  export interface All {
    readonly _tag: "Tuple";
    readonly fields: readonly AllTypes[];
  }
}

/** A dictionary with a common key type and value type. */
export interface Dict<K extends Any, V extends Any> {
  readonly _tag: "Dict";
  readonly key: K;
  readonly value: V;
}

export declare namespace Dict {
  /** A dictionary with erased key and value type parameters. */
  export type Any = Dict<AnyType, AnyType>;
  /** A dictionary with inspectable key and value types. */
  export interface All extends Dict<AllTypes, AllTypes> {}
}

/** A variable-length sequence with a common element type. */
export interface List<T extends Any> {
  readonly _tag: "List";
  readonly element: T;
}

export declare namespace List {
  /** A list with erased element type parameters. */
  export type Any = List<AnyType>;
  /** A list whose element type supports discriminant narrowing. */
  export interface All extends List<AllTypes> {}
}

/** A function with ordered parameters and a result type. */
export interface Function<
  Parameters extends readonly Any[],
  Returns extends Any,
> {
  readonly _tag: "Function";
  readonly parameters: Parameters;
  readonly returns: Returns;
}

export declare namespace Function {
  /** A function with erased parameter and result types. */
  export interface Any {
    readonly _tag: "Function";
    readonly parameters: readonly AnyType[];
    readonly returns: AnyType;
  }
  /** A function whose parameter and result types support discriminant narrowing. */
  export interface All extends Function<readonly AllTypes[], AllTypes> {}
}

/**
 * A type-level operation whose input is a tuple of semantic types.
 *
 * An implementation reads its arguments from `this["Target"]` and computes the descriptor in `type`. This is Effect's `HKT.TypeLambda` encoding with the result constrained to a descriptor. {@link TypeConstructor} and {@link FunctionSignature} are the two kinds the SDK applies.
 */
export interface TypeLambda extends HKT.TypeLambda {
  readonly type: Any;
}

export declare namespace TypeLambda {
  /**
   * Computes the descriptor a {@link TypeLambda} produces for an argument tuple.
   *
   * TypeScript evaluates the operation during checking. The SDK has no runtime type interpreter. The result is a static annotation on the syntax a call emits.
   */
  export type Apply<
    Lambda extends TypeLambda,
    Arguments extends readonly Any[],
  > = HKT.Kind<Lambda, never, never, never, Arguments>;
}

/**
 * A generic type declaration with a fixed number of positional type arguments.
 *
 * Declare `arity` as a numeric literal. TypeScript checks that the arity argument to `TypeExpression.constructor` equals that literal. A constructor call must supply exactly that many type arguments. The `type` member maps the argument descriptors in `this["Target"]` to the resulting type.
 *
 * @example <caption>Type-only: declare the result of a two-argument generic type.</caption>
 * ```ts
 * import type { Type } from "@local/hashql";
 *
 * type Equal<A, B> =
 *   (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
 *     ? true
 *     : false;
 *
 * interface Pair extends Type.TypeConstructor {
 *   readonly arity: 2;
 *   readonly type: this["Target"] extends readonly [
 *     infer L extends Type.Any,
 *     infer R extends Type.Any,
 *   ]
 *     ? Type.Tuple<readonly [L, R]>
 *     : Type.Never;
 * }
 *
 * export const applied: Equal<
 *   Type.TypeLambda.Apply<Pair, readonly [Type.PrimitiveString, Type.PrimitiveInteger]>,
 *   Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>
 * > = true;
 * ```
 */
export interface TypeConstructor extends TypeLambda {
  /** The number of type arguments every application supplies. */
  readonly arity: number;
}

/**
 * Computes a function signature from the types of its call arguments.
 *
 * Given an argument descriptor tuple, {@link TypeLambda.Apply} computes the function's `parameters` and `returns`. A signature can reject unsupported arguments with a {@link Never} parameter type. Only an argument whose descriptor is itself {@link Never} satisfies it.
 *
 * @example <caption>Type-only: specialize a generic function signature.</caption>
 * ```ts
 * import type { Type } from "@local/hashql";
 *
 * type Equal<A, B> =
 *   (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
 *     ? true
 *     : false;
 *
 * interface First extends Type.FunctionSignature {
 *   readonly type: this["Target"] extends readonly [
 *     infer L extends Type.Any,
 *     infer R extends Type.Any,
 *   ]
 *     ? Type.Function<readonly [L, R], L>
 *     : Type.Function<readonly [Type.Never, Type.Never], Type.Never>;
 * }
 *
 * type Specialized = Type.TypeLambda.Apply<
 *   First,
 *   readonly [Type.PrimitiveString, Type.PrimitiveInteger]
 * >;
 * export const firstIsString: Equal<
 *   Specialized["returns"],
 *   Type.PrimitiveString
 * > = true;
 * ```
 */
export interface FunctionSignature extends TypeLambda {
  readonly type: Function.Any;
}

/** A function whose parameter and result types depend on its call arguments. */
export interface GenericFunction<Signature extends FunctionSignature> {
  readonly _tag: "GenericFunction";
  /** The operation that derives the signature of each call. */
  readonly signature: Signature;
}

export declare namespace GenericFunction {
  /** A generic function with its signature operation erased. */
  export type Any = GenericFunction<FunctionSignature>;
  /** A generic function, identical to {@link GenericFunction.Any} because its signature is an operation rather than an inspectable descriptor. */
  export interface All extends GenericFunction<FunctionSignature> {}
}

/**
 * An arbitrary-precision integer.
 *
 * A `bigint` stands for this type in builder arguments. A JavaScript `number` stands for {@link PrimitiveNumber} even when its value is integral.
 */
export interface PrimitiveInteger {
  readonly _tag: "Integer";
  readonly value: bigint;
}

/**
 * A number, including integer values.
 *
 * TypeScript does not widen {@link PrimitiveInteger} to this type. A parameter of this type rejects an Integer expression or a `bigint`.
 */
export interface PrimitiveNumber {
  readonly _tag: "Number";
  readonly value: number;
}

/** A string value. */
export interface PrimitiveString {
  readonly _tag: "String";
  readonly value: string;
}

/** A Boolean value. */
export interface PrimitiveBoolean {
  readonly _tag: "Boolean";
  readonly value: boolean;
}

/** The null value. */
export interface PrimitiveNull {
  readonly _tag: "Null";
  readonly value: null;
}

/**
 * The primitive types.
 *
 * Each `value` member names the host JavaScript value type that builders accept in place of an expression of that type, such as `"text"` for {@link PrimitiveString} or `null` for {@link PrimitiveNull}.
 */
export type Primitive =
  | PrimitiveInteger
  | PrimitiveNumber
  | PrimitiveString
  | PrimitiveBoolean
  | PrimitiveNull;

/** The bottom type, which has no values. */
export interface Never {
  readonly _tag: "Never";
  readonly value: never;
}

/** The top type, which includes every value. */
export interface Unknown {
  readonly _tag: "Unknown";
  // oxlint-disable-next-line typescript/no-restricted-types -- represents the HashQL top type
  readonly value: unknown;
}
