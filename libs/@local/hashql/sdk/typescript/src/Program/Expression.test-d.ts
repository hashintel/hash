/**
 * Static checks for symbolic calls, field projections and input requirements.
 *
 * @module
 */
import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { Relocate, relocate } from "../internal/relocation.js";
import {
  adaptCallable,
  fromJExpr,
  ifElse,
  input,
  literal,
} from "./Expression.js";
import * as Structural from "./Structural.js";

import type * as JExpr from "../JExpr/index.js";
import type * as Type from "../Type.js";
import type {
  Adapted,
  Expression,
  Inputs as InputsOf,
  Value,
} from "./Expression.js";
import type { Arguments } from "./ExpressionType.js";
import type * as Inputs from "./Inputs.js";
import type * as ProgramError from "./ProgramError.js";

type Left = Type.Struct<{
  readonly shared: Type.List<Type.PrimitiveString>;
  readonly left: Type.PrimitiveBoolean;
}>;
type Right = Type.Struct<{
  readonly shared: Type.List<Type.Unknown>;
  readonly right: Type.PrimitiveInteger;
}>;

interface Recursive extends Type.Struct<{
  readonly next: Recursive;
  readonly value: Type.PrimitiveString;
}> {}

const outOfBoundsPosition = 2;

declare const left: Expression<Left, Inputs.Empty>;
declare const position: Expression<Type.PrimitiveInteger, Inputs.Empty>;
declare const text: Expression<Type.PrimitiveString, Inputs.Empty>;
declare const union: Expression<
  Type.Union<readonly [Left, Right]>,
  Inputs.Empty
>;
declare const intersection: Expression<
  Type.Intersection<readonly [Left, Right]>,
  Inputs.Empty
>;
declare const recursive: Expression<Recursive, Inputs.Empty>;

type Lookup = Type.Function<
  readonly [Type.PrimitiveString],
  Type.PrimitiveString
>;
type Trimmed = Adapted<
  Lookup,
  Inputs.Empty,
  (name: string) => Expression<Type.PrimitiveString, Inputs.Empty>
>;
declare const lookup: Expression<Lookup, Inputs.Empty>;
declare const trimmed: Trimmed;
declare const path: JExpr.Path.Path;

const preserve = <T extends Type.Any>(
  expression: Expression<T, Inputs.Empty>,
): Expression<T, Inputs.Empty> => expression;

describe("namespaces", () => {
  test("shape", () => {
    expectTypeOf<Expression.Shape<Left, Inputs.Empty>>().toEqualTypeOf<
      Expression<Left, Inputs.Empty>
    >();
    expectTypeOf<
      Expression.Shape<
        Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveBoolean>,
        { readonly enabled: Type.PrimitiveBoolean }
      >
    >().toEqualTypeOf<
      Expression<
        Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveBoolean>,
        { readonly enabled: Type.PrimitiveBoolean }
      >
    >();
  });

  test("erased_handle", () => {
    expectTypeOf<typeof left>().toExtend<Expression.Any>();
    expectTypeOf<Expression.Any>().not.toExtend<typeof left>();
    expectTypeOf<Expression.Any>().not.toExtend<
      Expression<Type.Any, Inputs.Empty>
    >();
  });

  test("erased_value", () => {
    expectTypeOf<Value.Any>().toEqualTypeOf<
      Expression.Any | string | number | bigint | boolean | null
    >();
    expectTypeOf<typeof text>().toExtend<Value.Any>();
    expectTypeOf<number>().not.toExtend<Value<Type.PrimitiveInteger>>();
  });

  test("argument_metadata", () => {
    type Values = readonly [
      Expression<
        Type.PrimitiveString,
        { readonly name?: Type.PrimitiveString }
      >,
      Expression<
        Type.PrimitiveInteger,
        { readonly limit: Type.PrimitiveInteger }
      >,
      boolean,
    ];
    expectTypeOf<Values>().toExtend<Arguments.Any>();
    expectTypeOf<Arguments.Types<Values>>().toEqualTypeOf<
      readonly [
        Type.PrimitiveString,
        Type.PrimitiveInteger,
        Type.PrimitiveBoolean,
      ]
    >();
    expectTypeOf<Arguments.Inputs<Values>>().toEqualTypeOf<{
      readonly name?: Type.PrimitiveString;
      readonly limit: Type.PrimitiveInteger;
    }>();
  });
});

describe("adapted", () => {
  test("erased_handle", () => {
    expectTypeOf<Trimmed>().toExtend<Expression.Any>();
    expectTypeOf<Trimmed>().toExtend<Value<Lookup>>();
  });

  test("relocation", () => {
    expectTypeOf(trimmed[Relocate](path)).toEqualTypeOf<
      Result.Result<Trimmed, ProgramError.Construction>
    >();
    expectTypeOf(relocate(trimmed, path)).toEqualTypeOf<
      Result.Result<Trimmed, ProgramError.Construction>
    >();
  });

  test("expression_factory", () => {
    expectTypeOf(
      adaptCallable(
        lookup,
        // @ts-expect-error The factory returns a host function rather than an expression.
        (self) => self,
      ),
    );
    expectTypeOf(
      adaptCallable(
        // @ts-expect-error The factory returns a host function rather than an expression.
        (self: Expression<Lookup, Inputs.Empty>) => self,
      ),
    );
  });
});

describe("binding", () => {
  test("primitive_identity", () => {
    expectTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >().not.toBeNever();
    expectTypeOf(text).not.toHaveProperty("$project");
    expectTypeOf(text).not.toHaveProperty("$index");
    expectTypeOf(text).not.toExtend<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    // @ts-expect-error A non-function expression has no call signature.
    text();
  });

  test("generic_preservation", () => {
    expectTypeOf(left.pipe(preserve)).toEqualTypeOf<
      Expression<Left, Inputs.Empty>
    >();
    expectTypeOf(preserve(left).shared).toEqualTypeOf<
      Expression<Type.List<Type.PrimitiveString>, Inputs.Empty>
    >();
  });

  test("recursive_projection", () => {
    expectTypeOf(recursive.next.next.value).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(recursive.$project("next").$project("value")).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
  });

  test("opaque_forwarding", () => {
    type Wrapped = Expression<Type.Opaque<"User", Left>, Inputs.Empty>;
    expectTypeOf<Wrapped["shared"]>().toEqualTypeOf<
      Expression<Type.List<Type.PrimitiveString>, Inputs.Empty>
    >();
    expectTypeOf<Wrapped>().not.toExtend<Expression<Left, Inputs.Empty>>();
    expectTypeOf<Wrapped>().not.toExtend<
      Expression<Type.Opaque<"Other", Left>, Inputs.Empty>
    >();
  });
});

describe("projection", () => {
  test("union_common_fields", () => {
    expectTypeOf(union).not.toHaveProperty("left");
    expectTypeOf(union).not.toHaveProperty("right");
    expectTypeOf(union.shared).toEqualTypeOf<
      Expression<
        Type.Union<
          readonly [Type.List<Type.PrimitiveString>, Type.List<Type.Unknown>]
        >,
        Inputs.Empty
      >
    >();
    expectTypeOf(union.$project("shared")).toEqualTypeOf<typeof union.shared>();
    // @ts-expect-error Every alternative must support the requested field.
    union.$project("left");
  });

  test("intersection_common_fields", () => {
    expectTypeOf(intersection).not.toHaveProperty("left");
    expectTypeOf(intersection).not.toHaveProperty("right");
    expectTypeOf(intersection.shared).toEqualTypeOf<
      Expression<
        Type.Intersection<
          readonly [Type.List<Type.PrimitiveString>, Type.List<Type.Unknown>]
        >,
        Inputs.Empty
      >
    >();
    expectTypeOf(intersection.$project("shared")).toEqualTypeOf<
      typeof intersection.shared
    >();
    // @ts-expect-error An intersection projection must be valid on every member.
    intersection.$project("right");
  });

  test("nullable_receiver", () => {
    type Nullable = Expression<
      Type.Union<readonly [Left, Type.PrimitiveNull]>,
      Inputs.Empty
    >;
    expectTypeOf<Nullable>().not.toHaveProperty("shared");
    expectTypeOf<Nullable>().not.toHaveProperty("$project");
    expectTypeOf<Nullable>().not.toBeNever();
  });

  test("tuple_positions", () => {
    type Pair = Expression<
      Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>,
      Inputs.Empty
    >;
    expectTypeOf<Pair[0]>().toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf<Pair[1]>().toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf<Pair>().not.toHaveProperty("length");
    expectTypeOf<Pair>().not.toHaveProperty("map");
    expectTypeOf<Pair>().not.toHaveProperty(outOfBoundsPosition);
  });
});

declare const pair: Expression<
  Type.Tuple<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>,
  Inputs.Empty
>;

describe("tuple_projection", () => {
  test("explicit_position", () => {
    expectTypeOf(pair.$project(0)).toEqualTypeOf<(typeof pair)[0]>();
    // @ts-expect-error The tuple has no third position.
    pair.$project(2);
    // @ts-expect-error The number type does not identify one fixed tuple field.
    pair.$project(Number("0"));
    // @ts-expect-error Direct access also rejects nonexistent tuple positions.
    expectTypeOf(pair[outOfBoundsPosition]);
  });

  test("empty_tuple", () => {
    type Empty = Expression<Type.Tuple<readonly []>, Inputs.Empty>;
    expectTypeOf<Empty>().not.toBeNever();
    expectTypeOf<Empty>().not.toHaveProperty(0);
    expectTypeOf<Empty>().not.toHaveProperty("$project");
  });
});

type Overlap = Type.Intersection<
  readonly [
    Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>,
    Type.Union<readonly [Type.PrimitiveInteger, Type.PrimitiveBoolean]>,
  ]
>;

type Algebra = Expression<
  Type.Struct<{
    readonly overlap: Overlap;
    readonly duplicate: Type.Union<
      readonly [
        Type.PrimitiveString,
        Type.Union<readonly [Type.PrimitiveString, Type.Never]>,
      ]
    >;
    readonly top: Type.Union<readonly [Type.PrimitiveString, Type.Unknown]>;
    readonly narrow: Type.Intersection<
      readonly [Type.Unknown, Type.PrimitiveString]
    >;
    readonly impossible: Type.Intersection<
      readonly [Type.PrimitiveString, Type.PrimitiveInteger]
    >;
    readonly emptyUnion: Type.Union<readonly []>;
    readonly emptyIntersection: Type.Intersection<readonly []>;
  }>,
  Inputs.Empty
>;

describe("composition", () => {
  test("distributive_narrowing", () => {
    type Narrowed = Expression<
      Type.Intersection<
        readonly [
          Type.Struct<{ readonly shared: Overlap["types"][0] }>,
          Type.Struct<{ readonly shared: Overlap["types"][1] }>,
        ]
      >,
      Inputs.Empty
    >;

    expectTypeOf<Algebra["overlap"]>().toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf<Narrowed["shared"]>().toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
  });

  test("union_identities", () => {
    expectTypeOf<Algebra["duplicate"]>().toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf<Algebra["top"]>().toEqualTypeOf<
      Expression<Type.Unknown, Inputs.Empty>
    >();
    expectTypeOf<Algebra["emptyUnion"]>().toEqualTypeOf<
      Expression<Type.Never, Inputs.Empty>
    >();
  });

  test("intersection_identities", () => {
    expectTypeOf<Algebra["narrow"]>().toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf<Algebra["impossible"]>().toEqualTypeOf<
      Expression<Type.Never, Inputs.Empty>
    >();
    expectTypeOf<Algebra["emptyIntersection"]>().toEqualTypeOf<
      Expression<Type.Unknown, Inputs.Empty>
    >();
  });

  test("numeric_intersection", () => {
    type Numeric = Type.Intersection<
      readonly [Type.PrimitiveInteger, Type.PrimitiveNumber]
    >;
    type Fields = Expression<
      Type.Struct<{ readonly value: Numeric }>,
      Inputs.Empty
    >;
    expectTypeOf<Fields["value"]>().toEqualTypeOf<
      Expression<Numeric, Inputs.Empty>
    >();
  });

  test("neutral_members", () => {
    type WithNever = Expression<
      Type.Union<readonly [Left, Type.Never]>,
      Inputs.Empty
    >;
    type WithUnknown = Expression<
      Type.Intersection<readonly [Left, Type.Unknown]>,
      Inputs.Empty
    >;
    expectTypeOf<WithNever["shared"]>().toEqualTypeOf<typeof left.shared>();
    expectTypeOf<WithUnknown["shared"]>().toEqualTypeOf<typeof left.shared>();
    expectTypeOf<WithNever>().not.toEqualTypeOf<
      Expression<Left, Inputs.Empty>
    >();
  });
});

declare const dictionary: Expression<
  Type.Dict<Type.PrimitiveString, Left>,
  Inputs.Empty
>;
declare const opaqueList: Expression<
  Type.Opaque<"Names", Type.List<Type.PrimitiveString>>,
  Inputs.Empty
>;

describe("indexing", () => {
  test("list_nullable", () => {
    expectTypeOf(left.shared.$index(position)).toEqualTypeOf<
      Expression<
        Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
    // @ts-expect-error List indices are integer expressions.
    left.shared.$index(text);
  });

  test("dictionary_nullable", () => {
    expectTypeOf(dictionary.$index(text)).toEqualTypeOf<
      Expression<Type.Union<readonly [Left, Type.PrimitiveNull]>, Inputs.Empty>
    >();
    expectTypeOf(dictionary.$index(text)).not.toHaveProperty("shared");
    // @ts-expect-error The dictionary declares a string key.
    dictionary.$index(position);
  });

  test("opaque_collection", () => {
    expectTypeOf(opaqueList.$index(position)).toEqualTypeOf<
      Expression<
        Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
  });

  test("composed_values", () => {
    expectTypeOf(union.shared.$index(position)).toEqualTypeOf<
      Expression<Type.Unknown, Inputs.Empty>
    >();
    expectTypeOf(intersection.shared.$index(position)).toEqualTypeOf<
      Expression<
        Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
  });

  test("incompatible_keys", () => {
    type MixedKeys = readonly [
      Type.Dict<Type.PrimitiveString, Left>,
      Type.Dict<Type.PrimitiveInteger, Right>,
    ];
    expectTypeOf<
      Expression<Type.Union<MixedKeys>, Inputs.Empty>
    >().not.toHaveProperty("$index");
    expectTypeOf<
      Expression<Type.Intersection<MixedKeys>, Inputs.Empty>
    >().not.toHaveProperty("$index");
    expectTypeOf<
      Expression<
        Type.Union<readonly [Type.List<Left>, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >().not.toHaveProperty("$index");
  });
});

type Key = Type.Struct<{ readonly id: Type.PrimitiveInteger }>;
declare const keyed: Expression<
  Type.Dict<Key, Type.PrimitiveString>,
  Inputs.Empty
>;
declare const key: Expression<Key, Inputs.Empty>;
declare const narrowerKey: Expression<
  Type.Struct<{
    readonly id: Type.PrimitiveInteger;
    readonly name: Type.PrimitiveString;
  }>,
  Inputs.Empty
>;
declare const unionKeyed: Expression<
  Type.Dict<Type.Union<[Type.PrimitiveString, Type.PrimitiveNull]>, Left>,
  Inputs.Empty
>;
declare const unionKey: Expression<
  Type.Union<[Type.PrimitiveString, Type.PrimitiveNull]>,
  Inputs.Empty
>;

declare const reserved: Expression<
  Type.Struct<{
    readonly $project: Type.PrimitiveString;
    readonly $index: Type.PrimitiveInteger;
    readonly get: Type.PrimitiveBoolean;
    readonly then: Type.PrimitiveString;
  }>,
  Inputs.Empty
>;
declare const incompatibleValues: Expression<
  Type.Intersection<
    readonly [
      Type.Dict<Type.PrimitiveString, Type.PrimitiveInteger>,
      Type.Dict<Type.PrimitiveString, Type.PrimitiveBoolean>,
    ]
  >,
  Inputs.Empty
>;

describe("operation_names", () => {
  test("explicit_reserved_field", () => {
    expectTypeOf(reserved.$project("$project")).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(reserved.$project("$index")).toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf(reserved).not.toHaveProperty("$index");
    expectTypeOf(reserved.get).toEqualTypeOf<
      Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
    expectTypeOf(reserved.then).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(reserved.$project("then")).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
  });

  test("uninhabited_value_lookup", () => {
    expectTypeOf(incompatibleValues.$index(text)).toEqualTypeOf<
      Expression<Type.PrimitiveNull, Inputs.Empty>
    >();
  });
});

describe("key_identity", () => {
  test("invariant_key", () => {
    expectTypeOf(keyed.$index(key)).toEqualTypeOf<
      Expression<
        Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
    // @ts-expect-error A narrower struct is not the declared key type.
    keyed.$index(narrowerKey);
  });

  test("declared_union_key", () => {
    expectTypeOf(unionKeyed.$index(unionKey)).toEqualTypeOf<
      Expression<Type.Union<readonly [Left, Type.PrimitiveNull]>, Inputs.Empty>
    >();
  });
});

const integerType = Result.getOrThrow(Structural.type(BigInt));
const numberType = Result.getOrThrow(Structural.type(Number));

interface Identity extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.Function<readonly [T], T>
    : Type.Function<readonly [Type.Never], Type.Never>;
}

declare const hostNumber: number;
declare const optionalNumber: number | undefined;

describe("primitive", () => {
  test("host_numeric_types", () => {
    expectTypeOf(literal(1)).toEqualTypeOf<
      Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(literal(1.5)).toEqualTypeOf<
      Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(literal(hostNumber)).toEqualTypeOf<
      Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(literal(1n)).toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf(literal(true)).toEqualTypeOf<
      Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
    expectTypeOf(literal("name")).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(literal(null)).toEqualTypeOf<
      Expression<Type.PrimitiveNull, Inputs.Empty>
    >();
  });

  test("fixed_and_generic", () => {
    const identity = fromJExpr<Type.GenericFunction<Identity>, Inputs.Empty>(
      "identity",
    );
    expectTypeOf(identity(7)).toEqualTypeOf<
      Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
    expectTypeOf(identity(7n)).toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    const fixed = fromJExpr<
      Type.Function<
        readonly [Type.PrimitiveNumber, Type.PrimitiveString],
        Type.PrimitiveBoolean
      >,
      { readonly receiver: Type.PrimitiveBoolean }
    >("fixed");
    const result = fixed(7, "literal");
    expectTypeOf<InputsOf<typeof result>>().toEqualTypeOf<{
      readonly receiver: Type.PrimitiveBoolean;
    }>();
    // @ts-expect-error The exact parameter descriptor is Number, not Integer.
    fixed(7n, "literal");
    // @ts-expect-error Primitive arguments do not disable arity checking.
    fixed(7);
    // @ts-expect-error Objects require explicit construction.
    identity({ field: true });
  });

  test("index_key", () => {
    const list = fromJExpr<Type.List<Type.PrimitiveString>, Inputs.Empty>(
      "list",
    );
    expectTypeOf(list.$index(0n)).toEqualTypeOf<
      Expression<
        Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
    // @ts-expect-error A list index requires Integer even when a number is integral.
    list.$index(0);
    const dict = fromJExpr<
      Type.Dict<Type.PrimitiveString, Type.PrimitiveBoolean>,
      Inputs.Empty
    >("dict");
    const selected = dict.$index("key");
    expectTypeOf(selected).toEqualTypeOf<
      Expression<
        Type.Union<readonly [Type.PrimitiveBoolean, Type.PrimitiveNull]>,
        Inputs.Empty
      >
    >();
  });

  test("input_defaults", () => {
    const number = input("number", numberType, 1);
    expectTypeOf<InputsOf<typeof number>>().toEqualTypeOf<{
      readonly number?: Type.PrimitiveNumber;
    }>();
    const uncertain = input("number", numberType, optionalNumber);
    expectTypeOf<InputsOf<typeof uncertain>>().toEqualTypeOf<{
      readonly number: Type.PrimitiveNumber;
    }>();
    // @ts-expect-error Defaults retain the declared numeric distinction.
    input("count", integerType, 1);
    // @ts-expect-error A bigint default does not widen to Number.
    input("number", numberType, 1n);
  });

  test("conditional_branches", () => {
    const count = input("count", integerType);
    const expression = ifElse(true, {
      then: count,
      else: 0n,
    });
    expectTypeOf(expression).toEqualTypeOf<
      Expression<
        Type.PrimitiveInteger,
        { readonly count: Type.PrimitiveInteger }
      >
    >();
    const numeric = ifElse(true, {
      then: 1,
      else: 2,
    });
    expectTypeOf(numeric).toEqualTypeOf<
      Expression<Type.PrimitiveNumber, Inputs.Empty>
    >();
  });
});
