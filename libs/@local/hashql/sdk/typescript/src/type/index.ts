/**
 * Compile-time descriptions of HashQL types.
 *
 * Use {@link Any} to constrain a generic without losing its concrete type arguments. Use {@link All} to inspect a type whose arguments are unknown and narrow it by `_tag`. Each generic type has corresponding `Any` and `All` forms.
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

/** A type constraint with erased parameters. */
type AnyType = Any;

/** The union of inspectable type forms. */
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

/** A nominal type distinguished by its name and underlying type. */
export interface Opaque<Name extends string | symbol, T extends Any> {
  readonly _tag: "Opaque";
  readonly name: Name;
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
  export interface Any {
    readonly _tag: "Function";
    readonly parameters: readonly AnyType[];
    readonly returns: AnyType;
  }
  export interface All extends Function<readonly AllTypes[], AllTypes> {}
}

/** A type-level operation whose input is a tuple of semantic types. */
export interface TypeLambda extends HKT.TypeLambda {
  readonly type: Any;
}

/** Applies a declaration's type-level operation without a runtime type interpreter. */
export type Apply<
  Lambda extends TypeLambda,
  Arguments extends readonly Any[],
> = HKT.Kind<Lambda, never, never, never, Arguments>;

/** A generic type declaration with a fixed number of positional type arguments. */
export interface TypeConstructor extends TypeLambda {
  readonly arity: number;
}

/** Computes a function signature from the types of its call arguments. */
export interface FunctionSignature extends TypeLambda {
  readonly type: Function.Any;
}

/** A function whose parameter and result types depend on its call arguments. */
export interface GenericFunction<Signature extends FunctionSignature> {
  readonly _tag: "GenericFunction";
  readonly signature: Signature;
}

export declare namespace GenericFunction {
  export type Any = GenericFunction<FunctionSignature>;
  export interface All extends GenericFunction<FunctionSignature> {}
}

/** An arbitrary-precision integer. */
export interface PrimitiveInteger {
  readonly _tag: "Integer";
  readonly value: bigint;
}

/** A number, including integer values. */
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
